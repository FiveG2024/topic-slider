import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthForSchool, schoolCatalogTenantId } from "@/lib/scope";

/**
 * Browse the tenant-wide Subject pool.
 *
 * For teachers/admins picking which subjects to link to a class. Returns every
 * active pool subject and, when a class is in scope, whether it is already
 * linked to that class — letting the UI render a clean checkbox grid.
 *
 * classId resolution: ?classId=… query param wins, otherwise session.classId.
 */
export async function GET(req: NextRequest) {
  const authz = await requireAuthForSchool();
  if (!authz.ok) return authz.res;

  const tenantId = schoolCatalogTenantId(authz.session);
  if (!tenantId) {
    return NextResponse.json(
      { error: "Pick a school site first (Class & subject).", code: "TENANT_SCOPE_REQUIRED" },
      { status: 400 }
    );
  }

  const url = new URL(req.url);
  const queryClassId = url.searchParams.get("classId")?.trim() || null;
  const classId = queryClassId || authz.session.user.classId || null;

  const [subjects, links] = await Promise.all([
    prisma.subject.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    classId
      ? prisma.subjectClass.findMany({
          where: { tenantId, classId },
          select: { subjectId: true },
        })
      : Promise.resolve([] as { subjectId: string }[]),
  ]);

  const linkedSet = new Set(links.map((l) => l.subjectId));

  return NextResponse.json({
    classId,
    subjects: subjects.map((s) => ({
      ...s,
      linkedToCurrentClass: linkedSet.has(s.id),
    })),
  });
}
