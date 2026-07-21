-- AlterTable: per-user browser-extension API key (SHA-256 hash only, never the raw key).
ALTER TABLE "User" ADD COLUMN     "apiKeyHash" TEXT;

-- CreateIndex: unique so a presented key resolves to exactly one user.
CREATE UNIQUE INDEX "User_apiKeyHash_key" ON "User"("apiKeyHash");
