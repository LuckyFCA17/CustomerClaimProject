-- Dokumen yang menggambarkan satu CPAR kini menunjuk CPAR-nya.
--
-- Bad News dan Quick Information tetap tingkat klaim dan `cparId`-nya kosong: keduanya
-- menggambarkan klaim, bukan salah satu CPAR-nya. Lembar CPAR dan lembar monitoring
-- milik satu CPAR, dan sejak satu klaim dapat punya beberapa, keduanya harus dapat
-- dibedakan.

ALTER TABLE "GeneratedDocument" ADD COLUMN "cparId" TEXT;

-- Baris lama: tiap klaim hanya pernah punya satu CPAR, jadi dokumen CPAR-nya tidak ada
-- yang perlu ditebak.
UPDATE "GeneratedDocument" AS d
   SET "cparId" = c."id"
  FROM "Cpar" AS c
 WHERE c."claimId" = d."claimId"
   AND d."kind" IN ('CPAR', 'MONITORING', 'A3');

DROP INDEX "GeneratedDocument_claimId_kind_cycle_version_key";

-- NULLS NOT DISTINCT: tanpa itu dua Bad News versi 1 pada satu klaim akan lolos, karena
-- PostgreSQL menganggap tiap NULL berbeda dari NULL lainnya.
CREATE UNIQUE INDEX "GeneratedDocument_claimId_cparId_kind_cycle_version_key"
    ON "GeneratedDocument"("claimId", "cparId", "kind", "cycle", "version") NULLS NOT DISTINCT;

CREATE INDEX "GeneratedDocument_cparId_idx" ON "GeneratedDocument"("cparId");

ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_cparId_fkey"
    FOREIGN KEY ("cparId") REFERENCES "Cpar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
