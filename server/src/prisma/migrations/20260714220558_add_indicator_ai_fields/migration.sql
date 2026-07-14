-- AlterTable
ALTER TABLE "Indicator" ADD COLUMN     "aiDescription" TEXT,
ADD COLUMN     "aiReasons" JSONB,
ADD COLUMN     "aiTags" JSONB,
ADD COLUMN     "aiTitle" TEXT;
