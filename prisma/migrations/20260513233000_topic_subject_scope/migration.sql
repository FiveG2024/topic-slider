-- Topic becomes subject-scoped. Per-class teaching state moves into a new
-- TopicClassStatus row so each class linked to the topic's subject tracks its
-- own "taught/untaught" independently.
--
-- Migration steps:
--   1. Create TopicClassStatus.
--   2. Backfill: one row per existing Topic carrying its old (classId, taught,
--      taughtAt). Historical topics keep their state in the class they were
--      created for.
--   3. Drop the now-redundant Topic columns + index + foreign key.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateTable
CREATE TABLE "TopicClassStatus" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "taught" BOOLEAN NOT NULL DEFAULT false,
    "taughtAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicClassStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TopicClassStatus_topicId_classId_key" ON "TopicClassStatus"("topicId", "classId");

-- CreateIndex
CREATE INDEX "TopicClassStatus_classId_idx" ON "TopicClassStatus"("classId");

-- CreateIndex
CREATE INDEX "TopicClassStatus_topicId_idx" ON "TopicClassStatus"("topicId");

-- AddForeignKey
ALTER TABLE "TopicClassStatus" ADD CONSTRAINT "TopicClassStatus_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicClassStatus" ADD CONSTRAINT "TopicClassStatus_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: preserve each topic's prior class + taught state.
INSERT INTO "TopicClassStatus" ("id", "topicId", "classId", "taught", "taughtAt", "createdAt", "updatedAt")
SELECT
    replace(gen_random_uuid()::text, '-', ''),
    t."id",
    t."classId",
    t."taught",
    t."taughtAt",
    NOW(),
    NOW()
FROM "Topic" t
ON CONFLICT ("topicId", "classId") DO NOTHING;

-- Drop old Topic columns now that state has moved.
ALTER TABLE "Topic" DROP CONSTRAINT IF EXISTS "Topic_classId_fkey";
DROP INDEX IF EXISTS "Topic_tenantId_classId_subjectId_idx";
ALTER TABLE "Topic" DROP COLUMN "classId";
ALTER TABLE "Topic" DROP COLUMN "taught";
ALTER TABLE "Topic" DROP COLUMN "taughtAt";

-- CreateIndex (matches schema's new combined index).
CREATE INDEX "Topic_tenantId_subjectId_idx" ON "Topic"("tenantId", "subjectId");
