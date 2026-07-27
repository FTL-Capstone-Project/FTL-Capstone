-- Community "Mark safe" vote (the inverse of the "Report it" flow).
--
-- Indicator.trustVotes is the fast counter the verdict card reads; UserTrust records WHO voted so
-- one person can't stuff the count. Both are purely additive — no existing column or row is touched,
-- and trustVotes defaults to 0, so every pre-existing indicator keeps working unchanged.
--
-- IF NOT EXISTS / IF EXISTS throughout, matching the other migrations in this folder: Render runs
-- `prisma migrate deploy` on every build, and a non-idempotent statement that has already been
-- applied by hand aborts the whole API build.
ALTER TABLE "Indicator" ADD COLUMN IF NOT EXISTS "trustVotes" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "UserTrust" (
    "id" SERIAL NOT NULL,
    "indicatorId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTrust_pkey" PRIMARY KEY ("id")
);

-- The unique index is what actually enforces one-vote-per-user-per-indicator; the route relies on
-- the resulting P2002 error to answer "you already vouched for this" instead of double-counting.
CREATE UNIQUE INDEX IF NOT EXISTS "UserTrust_indicatorId_userId_key" ON "UserTrust"("indicatorId", "userId");
CREATE INDEX IF NOT EXISTS "UserTrust_indicatorId_idx" ON "UserTrust"("indicatorId");
CREATE INDEX IF NOT EXISTS "UserTrust_userId_idx" ON "UserTrust"("userId");

-- FKs are added separately + guarded, because ADD CONSTRAINT has no IF NOT EXISTS in Postgres.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserTrust_indicatorId_fkey') THEN
    ALTER TABLE "UserTrust" ADD CONSTRAINT "UserTrust_indicatorId_fkey"
      FOREIGN KEY ("indicatorId") REFERENCES "Indicator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserTrust_userId_fkey') THEN
    ALTER TABLE "UserTrust" ADD CONSTRAINT "UserTrust_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
