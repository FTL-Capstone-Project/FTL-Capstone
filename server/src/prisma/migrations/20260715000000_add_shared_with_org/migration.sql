-- AlterTable: privacy gate for Team History (analyst must opt-in to share org-wide).
-- Additive + non-destructive: existing rows default to false.
ALTER TABLE "OrgReview" ADD COLUMN     "sharedWithOrg" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "OrgReview_sharedWithOrg_idx" ON "OrgReview"("sharedWithOrg");
