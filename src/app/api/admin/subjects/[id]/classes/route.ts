import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditForSessionFireAndForget } from "@/lib/audit-log";
import {
  requireAdmin,
  requireAuth,
  type ScopedSession,
  verifySubjectInTenant,
} from "@/lib/scope";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/subjects/:id/classes — list classes a pool subject is linked
 * to. Returns *every* active class in the tenant, with a `linked` flag.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const authz = await requireAuth();
  if (!authz.ok) return authz.res;
  const forbidden = requireAdmin(authz.session);
  if (forbidden) return forbidden;

  const tenantId = authz.session.user.tenantId;
  const { id: subjectId } = await params;

  const subject = await verifySubjectInTenant(tenantId, subjectId);
  if (!subject) {
    return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  }

  const [classes, links] = await Promise.all([
    prisma.schoolClass.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.subjectClass.findMany({
      where: { tenantId, subjectId },
      select: { classId: true },
    }),
  ]);

  const linked = new Set(links.map((l) => l.classId));
  return NextResponse.json({
    subject: { id: subject.id, name: subject.name },
    classes: classes.map((c) => ({ ...c, linked: linked.has(c.id) })),
  });
}

/**
 * PUT /api/admin/subjects/:id/classes — idempotently sync the classes this
 * subject is linked to. Body: `{ classIds: string[] }`. Any classes not in the
 * list are unlinked; any new ones are linked. Topic rows are NOT touched.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const authz = await requireAuth();
  if (!authz.ok) return authz.res;
  const forbidden = requireAdmin(authz.session);
  if (forbidden) return forbidden;

  const tenantId = authz.session.user.tenantId;
  const { id: subjectId } = await params;

  const subject = await verifySubjectInTenant(tenantId, subjectId);
  if (!subject) {
    return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  }

  const body = await req.json();
  const rawClassIds: unknown = body.classIds;
  if (!Array.isArray(rawClassIds)) {
    return NextResponse.json({ error: "classIds must be an array" }, { status: 400 });
  }
  const classIds = Array.from(
    new Set(
      rawClassIds.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    )
  );

  if (classIds.length > 0) {
    const validClasses = await prisma.schoolClass.findMany({
      where: { id: { in: classIds }, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (validClasses.length !== classIds.length) {
      return NextResponse.json(
        { error: "One or more classes are invalid for this site" },
        { status: 400 }
      );
    }
  }

  const existing = await prisma.subjectClass.findMany({
    where: { tenantId, subjectId },
    select: { classId: true },
  });
  const existingSet = new Set(existing.map((e) => e.classId));
  const nextSet = new Set(classIds);

  const toAdd = classIds.filter((id) => !existingSet.has(id));
  const toRemove = [...existingSet].filter((id) => !nextSet.has(id));

  await prisma.$transaction([
    ...(toRemove.length
      ? [
          prisma.subjectClass.deleteMany({
            where: { tenantId, subjectId, classId: { in: toRemove } },
          }),
        ]
      : []),
    ...(toAdd.length
      ? [
          prisma.subjectClass.createMany({
            data: toAdd.map((classId) => ({
              tenantId,
              subjectId,
              classId,
              assignedById: authz.session.user.id,
            })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);

  if (toAdd.length || toRemove.length) {
    auditForSessionFireAndForget(authz.session as ScopedSession, {
      action: "SUBJECT_CLASSES_UPDATE",
      entityType: "Subject",
      entityId: subjectId,
      summary: `Updated class links for subject “${subject.name}”`,
      metadata: { added: toAdd, removed: toRemove },
    });
  }

  return NextResponse.json({
    success: true,
    added: toAdd.length,
    removed: toRemove.length,
    classIds: [...nextSet],
  });
}
