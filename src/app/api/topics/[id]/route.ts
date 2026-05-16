import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditForSessionFireAndForget } from "@/lib/audit-log";
import {
  requireAdmin,
  requireAuth,
  requireAuthForSchool,
  requireTeachingContext,
  getTopicInTenant,
  topicVisibleInClass,
  type ScopedSession,
} from "@/lib/scope";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/topics/:id — site-scoped, plus a Common Pool check that the
 * topic's subject is linked to the user's current class. The response
 * includes the per-class taught/taughtAt from TopicClassStatus.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const authz = await requireAuthForSchool();
  if (!authz.ok) return authz.res;

  const { id } = await params;
  const isSuper = authz.session.user.role === "SUPER_ADMIN";

  const whereBase = isSuper
    ? {
        id,
        tenant: { isPlatform: false, deletedAt: null },
        subject: { deletedAt: null },
      }
    : {
        id,
        tenantId: authz.session.user.tenantId,
        subject: { deletedAt: null },
      };

  // The class context this read is performed against. For super-admin
  // browsing we use their picked view class; otherwise the session class.
  const classId = isSuper
    ? authz.session.user.classId ?? null
    : authz.session.user.classId ?? null;

  const topic = await prisma.topic.findFirst({
    where: whereBase,
    include: {
      contents: { orderBy: { sortOrder: "asc" } },
      quizzes: true,
      classStatuses: classId
        ? {
            where: { classId },
            select: { taught: true, taughtAt: true },
            take: 1,
          }
        : false,
    },
  });

  if (!topic) {
    return NextResponse.json(
      {
        error:
          "That topic was not found. It may belong to another class or site, or it may have been removed.",
        code: "TOPIC_NOT_FOUND",
      },
      { status: 404 }
    );
  }

  // Enforce that the subject is linked to the user's class context. Without
  // a class context (e.g. super-admin who hasn't picked one), allow read.
  if (classId && !isSuper) {
    const visible = await topicVisibleInClass(id, classId);
    if (!visible) {
      return NextResponse.json(
        {
          error:
            "That topic isn’t available in your current class. Its subject may have been unlinked from the pool.",
          code: "TOPIC_NOT_VISIBLE",
        },
        { status: 404 }
      );
    }
  }

  const status = Array.isArray(topic.classStatuses) ? topic.classStatuses[0] ?? null : null;
  return NextResponse.json({
    id: topic.id,
    title: topic.title,
    description: topic.description,
    subjectId: topic.subjectId,
    sortOrder: topic.sortOrder,
    jeopardyColumns: topic.jeopardyColumns,
    jeopardyRows: topic.jeopardyRows,
    jeopardyTeamCount: topic.jeopardyTeamCount,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
    contents: topic.contents,
    quizzes: topic.quizzes,
    taught: status?.taught ?? false,
    taughtAt: status?.taughtAt ?? null,
  });
}

/**
 * PUT /api/topics/:id — admin, same site. Title/description edit the shared
 * topic; toggling `taught` writes per-class state via TopicClassStatus for
 * the admin's current class.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const authz = await requireAuth();
  if (!authz.ok) return authz.res;
  const forbidden = requireAdmin(authz.session);
  if (forbidden) return forbidden;

  const { id } = await params;
  const existing = await getTopicInTenant(authz.session.user.tenantId, id);
  if (!existing) {
    return NextResponse.json(
      {
        error:
          "That topic was not found for your school, or you don’t have permission to change it.",
        code: "TOPIC_NOT_FOUND",
      },
      { status: 404 }
    );
  }

  const body = await req.json();
  const { title, description, taught } = body as {
    title?: string;
    description?: string | null;
    taught?: boolean;
  };

  const uid = authz.session.user.id;

  // Shared-topic edits (title / description).
  const sharedData: {
    title?: string;
    description?: string | null;
    updatedById?: string;
  } = {};
  if (title !== undefined) sharedData.title = title.trim();
  if (description !== undefined) sharedData.description = description?.trim() || null;
  if (Object.keys(sharedData).length > 0) {
    sharedData.updatedById = uid;
  }

  // Per-class taught toggle — only meaningful with a teaching context, since
  // the same topic can be taught in one class and untaught in another.
  let perClassUpdated = false;
  if (taught !== undefined) {
    const ctx = requireTeachingContext(authz.session);
    if (!ctx.ok) return ctx.res;

    await prisma.topicClassStatus.upsert({
      where: { topicId_classId: { topicId: id, classId: ctx.classId } },
      update: { taught, taughtAt: taught ? new Date() : null },
      create: {
        topicId: id,
        classId: ctx.classId,
        taught,
        taughtAt: taught ? new Date() : null,
      },
    });
    perClassUpdated = true;
  }

  const topic =
    Object.keys(sharedData).length > 0
      ? await prisma.topic.update({ where: { id }, data: sharedData })
      : await prisma.topic.findUnique({ where: { id } });

  const status = topic
    ? await prisma.topicClassStatus.findFirst({
        where: {
          topicId: topic.id,
          classId: authz.session.user.classId ?? "__none__",
        },
        select: { taught: true, taughtAt: true },
      })
    : null;

  auditForSessionFireAndForget(authz.session as ScopedSession, {
    action: "TOPIC_UPDATE",
    entityType: "Topic",
    entityId: id,
    summary: `Updated topic “${topic?.title ?? existing.title}”`,
    metadata: {
      title: topic?.title,
      perClassTaughtToggled: perClassUpdated,
      ...(perClassUpdated && taught !== undefined ? { taught } : {}),
    },
  });

  return NextResponse.json({
    ...topic,
    taught: status?.taught ?? false,
    taughtAt: status?.taughtAt ?? null,
  });
}

// DELETE /api/topics/:id — admin, same site. Deletes the shared topic for
// every class linked to its subject. TopicClassStatus + Star + Content
// rows cascade.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const authz = await requireAuth();
  if (!authz.ok) return authz.res;
  const forbidden = requireAdmin(authz.session);
  if (forbidden) return forbidden;

  const { id } = await params;
  const existing = await getTopicInTenant(authz.session.user.tenantId, id);
  if (!existing) {
    return NextResponse.json(
      {
        error:
          "That topic was not found for your school, or you don’t have permission to delete it.",
        code: "TOPIC_NOT_FOUND",
      },
      { status: 404 }
    );
  }

  auditForSessionFireAndForget(authz.session as ScopedSession, {
    action: "TOPIC_DELETE",
    entityType: "Topic",
    entityId: id,
    summary: `Deleted topic “${existing.title}” (subject pool)`,
    metadata: { title: existing.title, subjectId: existing.subjectId },
  });

  await prisma.topic.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
