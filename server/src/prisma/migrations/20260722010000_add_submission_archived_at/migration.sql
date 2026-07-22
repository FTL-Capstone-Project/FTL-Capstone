-- AlterTable: soft-archive flag for a user's own submission (null = active).
-- IF NOT EXISTS because this column was already applied to the live Neon DB by hand (via
-- `prisma db execute`) before this migration was recorded in _prisma_migrations. Without the
-- guard, `prisma migrate deploy` on Render errors with "column already exists" and aborts the
-- whole API build. Idempotent = safe to run whether or not the column is already there.
ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
