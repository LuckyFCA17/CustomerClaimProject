-- PIC yang diminta melengkapi tiap Initial Document Request.
--
-- Boleh kosong: CPAR yang sudah terbit sebelum kolom ini ada tetap sah, dan penunjukan
-- orangnya kerap menyusul setelah departemen penanggung jawab membagi pekerjaan.
ALTER TABLE "CparInitialDocument" ADD COLUMN "picId" TEXT;

CREATE INDEX "CparInitialDocument_picId_idx" ON "CparInitialDocument"("picId");

ALTER TABLE "CparInitialDocument" ADD CONSTRAINT "CparInitialDocument_picId_fkey"
  FOREIGN KEY ("picId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
