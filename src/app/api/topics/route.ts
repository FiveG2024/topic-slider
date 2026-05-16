import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditForSessionFireAndForget } from "@/lib/audit-log";
import {
  requireAdmin,
  requireAuth,
  requireAuthForSchool,
  requireTeachingContext,
  type ScopedSession,
  verifyClassInTenant,
  verifySubjectInTenant,
  verifySubjectLinkedToClass,
} from "@/lib/scope";

/**
 * Shape returned to clients. Topics are subject-scoped, but every read here
 * is performed in the context of a class, so we surface that class's
 * `taught`/`taughtAt` from TopicClassStatus on each row. Absent status row
 * means "not taught in this class yet".
 */
function shapeTopic(
  topic: {
    id: string;
    title: string;
    description: string | null;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
    _count: { contents: number; quizzes: number };
    createdBy: { username: string; displayName: string | null; role: string } | null;
    updatedBy: { username: string; displayName: string | null; role: string } | null;
    classStatuses: { taught: boolean; taughtAt: Date | null }[];
  }
) {
  const status = topic.classStatuses[0] ?? null;
  return {
    id: topic.id,
    title: topic.title,
    description: topic.description,
    sortOrder: topic.sortOrder,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
    taught: status?.taught ?? false,
    taughtAt: status?.taughtAt ?? null,
    _count: topic._count,
    createdBy: topic.createdBy,
    updatedBy: topic.updatedBy,
  };
}

// GET /api/topics — topics for the current subject, visible because the
// subject is linked to the current class. Each topic carries that class's
// per-class taught status.
export async function GET() {
  const authz = await requireAuthForSchool();
  if (!authz.ok) return authz.res;
  const ctx = requireTeachingContext(authz.session);
  if (!ctx.ok) return ctx.res;

  const topics = await prisma.topic.findMany({
    where: {
      tenantId: ctx.tenantId,
      subjectId: ctx.subjectId,
      subject: {
        deletedAt: null,
        classLinks: { some: { classId: ctx.classId, schoolClass: { deletedAt: null } } },
      },
    },
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { contents: true, quizzes: true } },
      createdBy: { select: { username: true, displayName: true, role: true } },
      updatedBy: { select: { username: true, displayName: true, role: true } },
      classStatuses: {
        where: { classId: ctx.classId },
        select: { taught: true, taughtAt: true },
        take: 1,
      },
    },
  });

  return NextResponse.json(topics.map(shapeTopic));
}

// POST /api/topics — admin. Creates a *subject-scoped* topic. classId in the
// body is the admin's current class and is required only to gate creation
// (subject must be linked to that class). The topic itself has no class.
export async function POST(req: NextRequest) {
  const authz = await requireAuth();
  if (!authz.ok) return authz.res;
  const forbidden = requireAdmin(authz.session);
  if (forbidden) return forbidden;

  const body = await req.json();
  const { title, description, classId, subjectId } = body as {
    title?: string;
    description?: string;
    classId?: string;
    subjectId?: string;
  };

  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (!classId || typeof classId !== "string" || !subjectId || typeof subjectId !== "string") {
    return NextResponse.json(
      { error: "classId and subjectId are required" },
      { status: 400 }
    );
  }

  const tenantId = authz.session.user.tenantId;
  const [cls, sub] = await Promise.all([
    verifyClassInTenant(tenantId, classId),
    verifySubjectInTenant(tenantId, subjectId),
  ]);
  if (!cls || !sub) {
    return NextResponse.json({ error: "Invalid class or subject for this site" }, { status: 400 });
  }

  const linked = await verifySubjectLinkedToClass(tenantId, subjectId, classId);
  if (!linked) {
    return NextResponse.json(
      {
        error:
          "That subject isn’t linked to this class yet. Open Subjects (admin) and add this subject to the class first.",
        code: "SUBJECT_NOT_LINKED",
      },
      { status: 400 }
    );
  }

  const maxOrder = await prisma.topic.aggregate({
    where: { tenantId, subjectId, subject: { deletedAt: null } },
    _max: { sortOrder: true },
  });

  const uid = authz.session.user.id;
  const topic = await prisma.topic.create({
    data: {
      tenantId,
      subjectId,
      title: title.trim(),
      description: description?.trim() || null,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      createdById: uid,
      updatedById: uid,
    },
    include: {
      _count: { select: { contents: true, quizzes: true } },
      createdBy: { select: { username: true, displayName: true, role: true } },
      updatedBy: { select: { username: true, displayName: true, role: true } },
      classStatuses: {
        where: { classId },
        select: { taught: true, taughtAt: true },
        take: 1,
      },
    },
  });

  auditForSessionFireAndForget(authz.session as ScopedSession, {
    action: "TOPIC_CREATE",
    entityType: "Topic",
    entityId: topic.id,
    summary: `Created topic “${topic.title}” (subject pool)`,
    metadata: { title: topic.title, subjectId, viaClassId: classId },
  });

  return NextResponse.json(shapeTopic(topic), { status: 201 });
}
