-- CreateEnum
CREATE TYPE "MonitoringJudgement" AS ENUM ('PENDING', 'OK', 'NG', 'OK_NEED_IMPROVEMENT');

-- AlterTable
ALTER TABLE "MonitoringCheck" ADD COLUMN     "judgedAt" TIMESTAMP(3),
ADD COLUMN     "judgedById" TEXT,
ADD COLUMN     "judgement" "MonitoringJudgement" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "note" TEXT;

-- AddForeignKey
ALTER TABLE "MonitoringCheck" ADD CONSTRAINT "MonitoringCheck_judgedById_fkey" FOREIGN KEY ("judgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
