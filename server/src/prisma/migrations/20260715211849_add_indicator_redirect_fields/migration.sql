-- AlterTable
ALTER TABLE "Indicator" ADD COLUMN     "finalHost" TEXT,
ADD COLUMN     "finalUrl" TEXT,
ADD COLUMN     "redirectedToDifferentHost" BOOLEAN NOT NULL DEFAULT false;
