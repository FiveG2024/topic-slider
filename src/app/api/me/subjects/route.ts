import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthForSchool, schoolCatalogTenantId } from "@/lib/scope";

/**
 * Subjects available to teach in a given class.
 *
 * Common Pool model: Subject lives tenant-wide; here we only return the ones
 * that have been *linked* to the requested class via SubjectClass.
 *
 * classId resolution order:
 *   1. ?classId=… query param (lets the Class & subject picker preview a
 *      different class before the session is updated).
 *   2. Current teaching context (session.user.classId).
 *
 * When neither is set we return an empty list rather than every pool subject —
 * the UI is expected to ask the user to pick a class first.
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

  if (!classId) {
    return NextResponse.json([]);
  }

  const links = await prisma.subjectClass.findMany({
    where: {
      tenantId,
      classId,
      subject: { deletedAt: null },
      schoolClass: { deletedAt: null },
    },
    orderBy: { subject: { name: "asc" } },
    select: {
      subject: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(links.map((l) => l.subject));
}
