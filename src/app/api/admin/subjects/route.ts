import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth, verifyClassInTenant } from "@/lib/scope";

/**
 * GET /api/admin/subjects — full pool overview for the admin's tenant.
 * Each row carries the active classes the subject is currently linked to,
 * powering the /admin/subjects management page.
 */
export async function GET() {
  const authz = await requireAuth();
  if (!authz.ok) return authz.res;
  const forbidden = requireAdmin(authz.session);
  if (forbidden) return forbidden;

  const tenantId = authz.session.user.tenantId;

  const subjects = await prisma.subject.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      classLinks: {
        where: { schoolClass: { deletedAt: null } },
        select: {
          schoolClass: { select: { id: true, code: true, name: true } },
        },
      },
    },
  });

  return NextResponse.json(
    subjects.map((s) => ({
      id: s.id,
      name: s.name,
      classes: s.classLinks
        .map((l) => l.schoolClass)
        .sort((a, b) => a.code.localeCompare(b.code)),
    }))
  );
}

/**
 * POST /api/admin/subjects — create a new pool subject.
 * Optional `classIds` immediately links the subject to one or more classes.
 */
export async function POST(req: NextRequest) {
  const authz = await requireAuth();
  if (!authz.ok) return authz.res;
  const forbidden = requireAdmin(authz.session);
  if (forbidden) return forbidden;

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const rawClassIds: unknown = body.classIds;
  const classIds: string[] = Array.isArray(rawClassIds)
    ? Array.from(
        new Set(
          rawClassIds.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        )
      )
    : [];

  const tenantId = authz.session.user.tenantId;

  if (classIds.length > 0) {
    const verified = await Promise.all(classIds.map((id) => verifyClassInTenant(tenantId, id)));
    if (verified.some((v) => !v)) {
      return NextResponse.json(
        { error: "One or more classes are invalid for this site" },
        { status: 400 }
      );
    }
  }

  try {
    const row = await prisma.subject.create({
      data: {
        tenantId,
        name,
        classLinks: classIds.length
          ? {
              create: classIds.map((classId) => ({
                tenantId,
                classId,
                assignedById: authz.session.user.id,
              })),
            }
          : undefined,
      },
      select: { id: true, name: true },
    });
    return NextResponse.json(row, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Subject name already exists for this site" },
      { status: 409 }
    );
  }
}
