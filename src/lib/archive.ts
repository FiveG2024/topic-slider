import { prisma } from "@/lib/prisma";

/**
 * Topics visible in a class. Since topics are subject-scoped, this counts
 * every active topic whose subject is currently linked to the class.
 * Used by the archive flow to prevent surprising data loss.
 */
export async function countTopicsForClass(tenantId: string, classId: string) {
  return prisma.topic.count({
    where: {
      tenantId,
      subject: {
        deletedAt: null,
        classLinks: { some: { classId } },
      },
    },
  });
}

export async function countTopicsForSubject(tenantId: string, subjectId: string) {
  return prisma.topic.count({ where: { tenantId, subjectId } });
}

export async function countActiveStudentsForClass(classId: string) {
  return prisma.student.count({
    where: { classId, deletedAt: null },
  });
}



/** How many active classes a pool subject is currently linked to. */
export async function countLinkedClassesForSubject(tenantId: string, subjectId: string) {
  return prisma.subjectClass.count({
    where: {
      tenantId,
      subjectId,
      schoolClass: { deletedAt: null },
    },
  });
}

/** How many active pool subjects a class is currently linked to. */
export async function countLinkedSubjectsForClass(tenantId: string, classId: string) {
  return prisma.subjectClass.count({
    where: {
      tenantId,
      classId,
      subject: { deletedAt: null },
    },
  });
}
