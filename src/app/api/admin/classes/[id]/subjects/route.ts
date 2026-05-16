import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditForSessionFireAndForget } from "@/lib/audit-log";
import {
  requireAdmin,
  requireAuth,
  type ScopedSession,
  verifyClassInTenant,
} from "@/lib/scope";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/classes/:id/subjects — list every active pool subject in
 * the tenant with a `linked` flag for this class. Powers the per-class
 * "Link from pool" picker.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const authz = await requireAuth();
  if (!authz.ok) return authz.res;
  const forbidden = requireAdmin(authz.session);
  if (forbidden) return forbidden;

  const tenantId = authz.session.user.tenantId;
  const { id: classId } = await params;

  const schoolClass = await verifyClassInTenant(tenantId, classId);
  if (!schoolClass) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 });
  }

  const [subjects, links] = await Promise.all([
    prisma.subject.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.subjectClass.findMany({
      where: { tenantId, classId },
      select: { subjectId: true },
    }),
  ]);

  const linked = new Set(links.map((l) => l.subjectId));
  return NextResponse.json({
    class: { id: schoolClass.id, code: schoolClass.code, name: schoolClass.name },
    subjects: subjects.map((s) => ({ ...s, linked: linked.has(s.id) })),
  });
}

/**
 * PUT /api/admin/classes/:id/subjects — idempotently sync which pool subjects
 * are linked to this class. Body: `{ subjectIds: string[] }`. Mirror of
 * `PUT /api/admin/subjects/:id/classes`.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const authz = await requireAuth();
  if (!authz.ok) return authz.res;
  const forbidden = requireAdmin(authz.session);
  if (forbidden) return forbidden;

  const tenantId = authz.session.user.tenantId;
  const { id: classId } = await params;

  const schoolClass = await verifyClassInTenant(tenantId, classId);
  if (!schoolClass) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 });
  }

  const body = await req.json();
  const rawSubjectIds: unknown = body.subjectIds;
  if (!Array.isArray(rawSubjectIds)) {
    return NextResponse.json({ error: "subjectIds must be an array" }, { status: 400 });
  }
  const subjectIds = Array.from(
    new Set(
      rawSubjectIds.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    )
  );

  if (subjectIds.length > 0) {
    const valid = await prisma.subject.findMany({
      where: { id: { in: subjectIds }, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (valid.length !== subjectIds.length) {
      return NextResponse.json(
        { error: "One or more subjects are invalid for this site" },
        { status: 400 }
      );
    }
  }

  const existing = await prisma.subjectClass.findMany({
    where: { tenantId, classId },
    select: { subjectId: true },
  });
  const existingSet = new Set(existing.map((e) => e.subjectId));
  const nextSet = new Set(subjectIds);

  const toAdd = subjectIds.filter((id) => !existingSet.has(id));
  const toRemove = [...existingSet].filter((id) => !nextSet.has(id));

  await prisma.$transaction([
    ...(toRemove.length
      ? [
          prisma.subjectClass.deleteMany({
            where: { tenantId, classId, subjectId: { in: toRemove } },
          }),
        ]
      : []),
    ...(toAdd.length
      ? [
          prisma.subjectClass.createMany({
            data: toAdd.map((subjectId) => ({
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
    const label = schoolClass.name ? `${schoolClass.code} — ${schoolClass.name}` : schoolClass.code;
    auditForSessionFireAndForget(authz.session as ScopedSession, {
      action: "CLASS_SUBJECTS_UPDATE",
      entityType: "SchoolClass",
      entityId: classId,
      summary: `Updated subject links for class ${label}`,
      metadata: { added: toAdd, removed: toRemove },
    });
  }

  return NextResponse.json({
    success: true,
    added: toAdd.length,
    removed: toRemove.length,
    subjectIds: [...nextSet],
  });
}
