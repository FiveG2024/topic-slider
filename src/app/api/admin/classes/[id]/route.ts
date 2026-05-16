import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  countActiveStudentsForClass,
  countTopicsForClass,
} from "@/lib/archive";
import { requireAdmin, requireAuth } from "@/lib/scope";

type Params = { params: Promise<{ id: string }> };

/** Soft-delete (archive) a class. Blocked if it has topics or active students. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const authz = await requireAuth();
  if (!authz.ok) return authz.res;
  const forbidden = requireAdmin(authz.session);
  if (forbidden) return forbidden;

  const tenantId = authz.session.user.tenantId;
  const { id } = await params;

  const row = await prisma.schoolClass.findFirst({
    where: { id, tenantId, deletedAt: null },
  });
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [topicCount, studentCount] = await Promise.all([
    countTopicsForClass(tenantId, id),
    countActiveStudentsForClass(id),
  ]);
  if (topicCount > 0) {
    return NextResponse.json(
      {
        error:
          "Cannot archive a class that still has topics. Unlink its subjects from the pool first (Admin → Subject pool).",
        code: "HAS_TOPICS",
        topicCount,
      },
      { status: 409 }
    );
  }
  if (studentCount > 0) {
    return NextResponse.json(
      {
        error:
          "Cannot archive a class that still has students. Archive students or move them first.",
        code: "HAS_STUDENTS",
        studentCount,
      },
      { status: 409 }
    );
  }

  await prisma.schoolClass.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  return NextResponse.json({ success: true });
}
