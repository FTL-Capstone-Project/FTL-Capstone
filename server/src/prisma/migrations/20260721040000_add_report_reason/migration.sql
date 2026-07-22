-- CreateTable: free-text "why I reported this" tied to an indicator (count stays on Indicator).
CREATE TABLE "ReportReason" (
    "id" SERIAL NOT NULL,
    "indicatorId" INTEGER NOT NULL,
    "userId" INTEGER,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReportReason_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReportReason_indicatorId_idx" ON "ReportReason"("indicatorId");

ALTER TABLE "ReportReason" ADD CONSTRAINT "ReportReason_indicatorId_fkey"
    FOREIGN KEY ("indicatorId") REFERENCES "Indicator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
