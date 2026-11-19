-- Satu klaim dapat memiliki lebih dari satu CPAR.
--
-- Pemantauan ikut berpindah induk: periode dan item check membuktikan countermeasure,
-- dan countermeasure milik satu CPAR — bukan milik klaim. Kolom `claimId` tetap ada
-- sebagai denormalisasi supaya pengecekan izin dan rekap lintas CPAR tidak perlu join
-- berantai.
--
-- Pengisian `cparId` memakai CPAR yang sudah ada pada tiap klaim. Sebelum migrasi ini
-- relasinya satu-ke-satu, jadi tiap baris pemantauan punya tepat satu calon induk dan
-- tidak ada yang perlu ditebak.

-- 1. CPAR tidak lagi unik per klaim.
DROP INDEX "Cpar_claimId_key";
CREATE INDEX "Cpar_claimId_idx" ON "Cpar"("claimId");

-- 2. Kolom ditambahkan nullable lebih dulu; baris lama belum punya nilainya.
ALTER TABLE "MonitoringPeriod" ADD COLUMN "cparId" TEXT;
ALTER TABLE "MonitoringCheckItem" ADD COLUMN "cparId" TEXT;

-- 3. Diisi dari CPAR klaimnya.
UPDATE "MonitoringPeriod" AS p
   SET "cparId" = c."id"
  FROM "Cpar" AS c
 WHERE c."claimId" = p."claimId";

UPDATE "MonitoringCheckItem" AS i
   SET "cparId" = c."id"
  FROM "Cpar" AS c
 WHERE c."claimId" = i."claimId";

-- 4. Baris pemantauan tanpa CPAR tidak mungkin ada — pemantauan hanya dibuka setelah
--    CPAR disetujui. Bila toh ada, ia data rusak dan dibuang di sini, bukan dibiarkan
--    menggagalkan migrasi dengan galat NOT NULL yang tidak menjelaskan apa-apa.
DELETE FROM "MonitoringPeriod" WHERE "cparId" IS NULL;
DELETE FROM "MonitoringCheckItem" WHERE "cparId" IS NULL;

ALTER TABLE "MonitoringPeriod" ALTER COLUMN "cparId" SET NOT NULL;
ALTER TABLE "MonitoringCheckItem" ALTER COLUMN "cparId" SET NOT NULL;

-- 5. Nomor periode bernilai ulang per CPAR, bukan per klaim.
DROP INDEX "MonitoringPeriod_claimId_cycle_periodNo_key";
CREATE UNIQUE INDEX "MonitoringPeriod_cparId_cycle_periodNo_key"
    ON "MonitoringPeriod"("cparId", "cycle", "periodNo");

CREATE INDEX "MonitoringPeriod_cparId_status_idx" ON "MonitoringPeriod"("cparId", "status");
CREATE INDEX "MonitoringCheckItem_cparId_cycle_idx" ON "MonitoringCheckItem"("cparId", "cycle");

ALTER TABLE "MonitoringPeriod" ADD CONSTRAINT "MonitoringPeriod_cparId_fkey"
    FOREIGN KEY ("cparId") REFERENCES "Cpar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MonitoringCheckItem" ADD CONSTRAINT "MonitoringCheckItem_cparId_fkey"
    FOREIGN KEY ("cparId") REFERENCES "Cpar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
