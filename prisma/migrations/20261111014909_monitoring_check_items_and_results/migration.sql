-- CreateEnum
CREATE TYPE "MonitoringResultKind" AS ENUM ('PRODUCTION', 'INSPECTION');

-- CreateTable
CREATE TABLE "MonitoringCheckItem" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MonitoringCheckItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringCheck" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoringCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringResult" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "kind" "MonitoringResultKind" NOT NULL,
    "recordedOn" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "okCount" INTEGER NOT NULL,
    "ngCount" INTEGER NOT NULL,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MonitoringResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonitoringCheckItem_claimId_cycle_idx" ON "MonitoringCheckItem"("claimId", "cycle");

-- CreateIndex
CREATE INDEX "MonitoringCheck_itemId_idx" ON "MonitoringCheck"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringCheck_periodId_itemId_key" ON "MonitoringCheck"("periodId", "itemId");

-- CreateIndex
CREATE INDEX "MonitoringResult_periodId_kind_recordedOn_idx" ON "MonitoringResult"("periodId", "kind", "recordedOn");

-- CreateIndex
CREATE INDEX "MonitoringResult_claimId_recordedOn_idx" ON "MonitoringResult"("claimId", "recordedOn");

-- AddForeignKey
ALTER TABLE "MonitoringCheckItem" ADD CONSTRAINT "MonitoringCheckItem_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringCheck" ADD CONSTRAINT "MonitoringCheck_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "MonitoringPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringCheck" ADD CONSTRAINT "MonitoringCheck_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MonitoringCheckItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringResult" ADD CONSTRAINT "MonitoringResult_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "MonitoringPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringResult" ADD CONSTRAINT "MonitoringResult_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringResult" ADD CONSTRAINT "MonitoringResult_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
