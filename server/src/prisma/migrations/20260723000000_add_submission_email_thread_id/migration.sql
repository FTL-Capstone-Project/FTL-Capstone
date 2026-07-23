-- AlterTable: Gmail thread id for a forwarded email (source "email"), so the report email can REPLY
-- into the user's original forward thread instead of arriving as a standalone message. Nullable =
-- untouched for web submissions and older rows. Additive, no data change.
ALTER TABLE "Submission" ADD COLUMN     "emailThreadId" TEXT;
