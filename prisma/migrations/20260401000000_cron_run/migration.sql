-- CreateTable CronRun
CREATE TABLE "CronRun" (
    "id"         TEXT NOT NULL,
    "type"       TEXT NOT NULL DEFAULT 'reestimate',
    "startedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "total"      INTEGER NOT NULL DEFAULT 0,
    "updated"    INTEGER NOT NULL DEFAULT 0,
    "skipped"    INTEGER NOT NULL DEFAULT 0,
    "errors"     INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    CONSTRAINT "CronRun_pkey" PRIMARY KEY ("id")
);

-- AddColumn cronRunId to ProductEstimateHistory
ALTER TABLE "ProductEstimateHistory" ADD COLUMN "cronRunId" TEXT;

-- CreateIndex
CREATE INDEX "ProductEstimateHistory_cronRunId_idx" ON "ProductEstimateHistory"("cronRunId");
CREATE INDEX "ProductEstimateHistory_createdAt_idx" ON "ProductEstimateHistory"("createdAt");

-- AddForeignKey
ALTER TABLE "ProductEstimateHistory"
    ADD CONSTRAINT "ProductEstimateHistory_cronRunId_fkey"
    FOREIGN KEY ("cronRunId") REFERENCES "CronRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
