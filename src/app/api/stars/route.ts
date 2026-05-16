import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forbidSuperAdminSchoolWrite, requireAuthForSchool, requireTeachingContext } from "@/lib/scope";

export async function POST(req: NextRequest) {
  const authz = await requireAuthForSchool();
  if (!authz.ok) return authz.res;
  const readOnly = forbidSuperAdminSchoolWrite(authz.session);
  if (readOnly) return readOnly;
  const ctx = requireTeachingContext(authz.session);
  if (!ctx.ok) return ctx.res;

  const body = await req.json();
  const { studentId, topicId, points } = body;

  if (!studentId || !topicId || typeof points !== "number") {
    return NextResponse.json(
      { error: "studentId, topicId, and points are required" },
      { status: 400 }
    );
  }

  const [student, topic] = await Promise.all([
    prisma.student.findFirst({
      where: {
        id: studentId,
        tenantId: ctx.tenantId,
        classId: ctx.classId,
        deletedAt: null,
      },
    }),
    // Topics are subject-scoped; the topic is valid for this class iff the
    // subject is linked to it via SubjectClass.
    prisma.topic.findFirst({
      where: {
        id: topicId,
        tenantId: ctx.tenantId,
        subjectId: ctx.subjectId,
        subject: {
          deletedAt: null,
          classLinks: {
            some: { classId: ctx.classId, schoolClass: { deletedAt: null } },
          },
        },
      },
    }),
  ]);

  if (!student || !topic) {
    return NextResponse.json(
      { error: "Student and topic must belong to your current class and subject" },
      { status: 400 }
    );
  }

  const star = await prisma.star.upsert({
    where: {
      studentId_topicId: { studentId, topicId },
    },
    update: {
      points: { increment: points },
    },
    create: {
      studentId,
      topicId,
      points,
    },
  });
  return NextResponse.json(star);
}

export async function GET(req: NextRequest) {
  const authz = await requireAuthForSchool();
  if (!authz.ok) return authz.res;
  const ctx = requireTeachingContext(authz.session);
  if (!ctx.ok) return ctx.res;

  const scope = req.nextUrl.searchParams.get("scope");
  const subjectSession = scope === "subject";

  const leaderboard = await prisma.student.findMany({
    where: { tenantId: ctx.tenantId, classId: ctx.classId, deletedAt: null },
    include: {
      stars: subjectSession
        ? { where: { topic: { subjectId: ctx.subjectId } } }
        : true,
    },
    orderBy: { firstName: "asc" },
  });

  const result = leaderboard
    .map((student) => ({
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      totalStars: student.stars.reduce((sum, s) => sum + s.points, 0),
    }))
    .sort((a, b) => b.totalStars - a.totalStars);

  return NextResponse.json(result);
}
