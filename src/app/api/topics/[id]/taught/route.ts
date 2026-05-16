import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  forbidSuperAdminSchoolWrite,
  requireAuthForSchool,
  requireTeachingContext,
  getTopicForSchoolRead,
  topicVisibleInClass,
} from "@/lib/scope";

/**
 * Mark the shared topic as taught *for the caller's current class*.
 * Per-class state lives in TopicClassStatus, so two classes can share the
 * same topic but independently track whether they've taught it.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireAuthForSchool();
  if (!authz.ok) return authz.res;
  const readOnly = forbidSuperAdminSchoolWrite(authz.session);
  if (readOnly) return readOnly;

  const ctx = requireTeachingContext(authz.session);
  if (!ctx.ok) return ctx.res;

  const { id } = await params;
  const existing = await getTopicForSchoolRead(authz.session, id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Don't let a volunteer mark "taught" for a class whose pool no longer
  // includes this topic's subject.
  const visible = await topicVisibleInClass(id, ctx.classId);
  if (!visible) {
    return NextResponse.json(
      {
        error:
          "That topic isn’t available in your current class. Ask an admin to re-link the subject from the pool.",
        code: "TOPIC_NOT_VISIBLE",
      },
      { status: 400 }
    );
  }

  const status = await prisma.topicClassStatus.upsert({
    where: { topicId_classId: { topicId: id, classId: ctx.classId } },
    update: { taught: true, taughtAt: new Date() },
    create: {
      topicId: id,
      classId: ctx.classId,
      taught: true,
      taughtAt: new Date(),
    },
  });

  return NextResponse.json({
    id: existing.id,
    title: existing.title,
    description: existing.description,
    subjectId: existing.subjectId,
    taught: status.taught,
    taughtAt: status.taughtAt,
  });
}
