-- Tahap CPAR disimpan pada CPAR-nya sendiri.
--
-- Sebelum ini tahap CPAR adalah status klaim, dan itu hanya mungkin selama satu klaim
-- punya satu CPAR. Status klaim sekarang menjadi turunan dari seluruh CPAR-nya.

CREATE TYPE "CparStatus" AS ENUM (
    'ISSUED', 'IN_PROGRESS', 'UNDER_VERIFICATION', 'REVISION', 'APPROVED', 'MONITORING', 'CLOSED'
);

ALTER TABLE "Cpar" ADD COLUMN "status" "CparStatus" NOT NULL DEFAULT 'ISSUED';
ALTER TABLE "Cpar" ADD COLUMN "closedAt" TIMESTAMP(3);

-- Baris lama mengambil tahapnya dari status klaimnya — satu-satunya tempat tahap itu
-- pernah tersimpan. Pemetaannya satu lawan satu karena dulu memang benda yang sama.
UPDATE "Cpar" AS c
   SET "status" = CASE k."status"
         WHEN 'CPAR_ISSUED'             THEN 'ISSUED'
         WHEN 'CPAR_IN_PROGRESS'        THEN 'IN_PROGRESS'
         WHEN 'CPAR_UNDER_VERIFICATION' THEN 'UNDER_VERIFICATION'
         WHEN 'CPAR_REVISION'           THEN 'REVISION'
         WHEN 'CPAR_APPROVED'           THEN 'APPROVED'
         WHEN 'CAPA_MONITORING'         THEN 'MONITORING'
         WHEN 'VERIFIED_CLOSED'         THEN 'CLOSED'
         ELSE 'ISSUED'
       END::"CparStatus"
  FROM "Claim" AS k
 WHERE k."id" = c."claimId";

-- Klaim yang sudah tertutup menurunkan waktu penutupannya ke CPAR-nya.
UPDATE "Cpar" AS c
   SET "closedAt" = k."closedAt"
  FROM "Claim" AS k
 WHERE k."id" = c."claimId" AND k."status" = 'VERIFIED_CLOSED';

CREATE INDEX "Cpar_status_idx" ON "Cpar"("status");
