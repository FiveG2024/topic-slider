-- Common Pool architecture: many-to-many between Subject and SchoolClass.
-- Subjects remain tenant-scoped (the "pool"); they are linked to one or many
-- classes via the new SubjectClass join table. Existing (class, subject) pairs
-- are backfilled from Topic so historical topics keep working.

-- CreateTable
CREATE TABLE "SubjectClass" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT,

    CONSTRAINT "SubjectClass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubjectClass_subjectId_classId_key" ON "SubjectClass"("subjectId", "classId");

-- CreateIndex
CREATE INDEX "SubjectClass_tenantId_idx" ON "SubjectClass"("tenantId");

-- CreateIndex
CREATE INDEX "SubjectClass_classId_idx" ON "SubjectClass"("classId");

-- CreateIndex
CREATE INDEX "SubjectClass_subjectId_idx" ON "SubjectClass"("subjectId");

-- AddForeignKey
ALTER TABLE "SubjectClass" ADD CONSTRAINT "SubjectClass_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectClass" ADD CONSTRAINT "SubjectClass_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectClass" ADD CONSTRAINT "SubjectClass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectClass" ADD CONSTRAINT "SubjectClass_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every distinct (tenantId, subjectId, classId) already used by a
-- Topic becomes a SubjectClass row so existing data continues to surface.
-- gen_random_uuid() requires pgcrypto; fall back to a deterministic id if
-- the extension is unavailable.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO "SubjectClass" ("id", "tenantId", "subjectId", "classId", "assignedAt")
SELECT
    replace(gen_random_uuid()::text, '-', ''),
    t."tenantId",
    t."subjectId",
    t."classId",
    NOW()
FROM (
    SELECT DISTINCT "tenantId", "subjectId", "classId"
    FROM "Topic"
) AS t
ON CONFLICT ("subjectId", "classId") DO NOTHING;
