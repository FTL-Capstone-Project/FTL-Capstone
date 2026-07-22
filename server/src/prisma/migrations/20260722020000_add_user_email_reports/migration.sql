-- AlterTable: per-user opt-out for the emailed report sent after a forwarded-email check finishes.
-- Default true = opted in, so existing users are unaffected (they keep getting report emails once
-- the outbound relay is configured; set false for in-app notifications only).
ALTER TABLE "User" ADD COLUMN     "emailReports" BOOLEAN NOT NULL DEFAULT true;
