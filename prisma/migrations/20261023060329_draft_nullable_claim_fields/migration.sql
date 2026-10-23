-- DropForeignKey
ALTER TABLE "Claim" DROP CONSTRAINT "Claim_ncDetailId_fkey";

-- DropForeignKey
ALTER TABLE "Claim" DROP CONSTRAINT "Claim_productCategoryId_fkey";

-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "draftSavedAt" TIMESTAMP(3),
ALTER COLUMN "type" DROP NOT NULL,
ALTER COLUMN "dateOfOccurrence" DROP NOT NULL,
ALTER COLUMN "shiftOfOccurrence" DROP NOT NULL,
ALTER COLUMN "dateOfReceived" DROP NOT NULL,
ALTER COLUMN "shiftOfReceived" DROP NOT NULL,
ALTER COLUMN "failurePlace" SET DEFAULT '',
ALTER COLUMN "failurePlaceType" DROP NOT NULL,
ALTER COLUMN "contactPerson" SET DEFAULT '',
ALTER COLUMN "contactEmail" SET DEFAULT '',
ALTER COLUMN "contactPhone" SET DEFAULT '',
ALTER COLUMN "internalPartNo" SET DEFAULT '',
ALTER COLUMN "customerPartNo" SET DEFAULT '',
ALTER COLUMN "partName" SET DEFAULT '',
ALTER COLUMN "productCategoryId" DROP NOT NULL,
ALTER COLUMN "originPlantType" DROP NOT NULL,
ALTER COLUMN "occurrence" DROP NOT NULL,
ALTER COLUMN "ncDetailId" DROP NOT NULL,
ALTER COLUMN "abnormalSource" SET DEFAULT '',
ALTER COLUMN "qualityProblem" SET DEFAULT '',
ALTER COLUMN "lotNo" SET DEFAULT '',
ALTER COLUMN "kanbanNo" SET DEFAULT '',
ALTER COLUMN "suspectedProcessLine" SET DEFAULT '';

-- AlterTable
ALTER TABLE "ClaimPart" ALTER COLUMN "partName" SET DEFAULT '',
ALTER COLUMN "nidPartNo" SET DEFAULT '',
ALTER COLUMN "qty" SET DEFAULT 0,
ALTER COLUMN "qtyUnit" SET DEFAULT 'PCS';

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_productCategoryId_fkey" FOREIGN KEY ("productCategoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_ncDetailId_fkey" FOREIGN KEY ("ncDetailId") REFERENCES "NonConformanceDetail"("id") ON DELETE SET NULL ON UPDATE CASCADE;
