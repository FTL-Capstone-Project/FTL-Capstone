-- AlterTable
ALTER TABLE "Indicator" ADD COLUMN     "globalReviewStatus" TEXT,
ADD COLUMN     "reportedCount" INTEGER NOT NULL DEFAULT 0;
