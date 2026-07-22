-- AlterTable: soft-archive flag for a user's own submission (null = active).
ALTER TABLE "Submission" ADD COLUMN "archivedAt" TIMESTAMP(3);
