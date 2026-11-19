-- Laporan perbaikan menutup satu pemantauan, dan pemantauan milik satu CPAR.
ALTER TABLE "ImprovementReport" ADD COLUMN "cparId" TEXT;

UPDATE "ImprovementReport" AS r
   SET "cparId" = c."id"
  FROM "Cpar" AS c
 WHERE c."claimId" = r."claimId";

-- Laporan tanpa CPAR tidak mungkin ada: ia hanya dibuat saat pemantauan ditutup.
DELETE FROM "ImprovementReport" WHERE "cparId" IS NULL;

ALTER TABLE "ImprovementReport" ALTER COLUMN "cparId" SET NOT NULL;

CREATE INDEX "ImprovementReport_cparId_cycle_idx" ON "ImprovementReport"("cparId", "cycle");

ALTER TABLE "ImprovementReport" ADD CONSTRAINT "ImprovementReport_cparId_fkey"
    FOREIGN KEY ("cparId") REFERENCES "Cpar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
