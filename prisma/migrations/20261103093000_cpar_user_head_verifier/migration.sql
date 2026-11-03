-- Verifier kapasitas "User Dept. Head" ditunjuk, bukan disimpulkan.
--
-- Sebelumnya kapasitas itu diberikan kepada siapa pun yang memegang role USER_HEAD dan
-- berada di departemen penanggung jawab. Aturan itu macet begitu departemen penanggung
-- jawabnya QA: tidak ada pemegang USER_HEAD di sana, sehingga CPAR tidak pernah mencapai
-- empat keputusan dan tertahan selamanya di CPAR_UNDER_VERIFICATION.
--
-- Kini orangnya ditunjuk saat CPAR diterbitkan, dari anggota departemen yang dipilih.
-- Boleh kosong agar CPAR yang terbit sebelum kolom ini ada tetap sah; untuk baris lama,
-- penunjukannya di-backfill di bawah bila kandidatnya tunggal dan tidak meragukan.
ALTER TABLE "Cpar" ADD COLUMN "userHeadVerifierId" TEXT;

CREATE INDEX "Cpar_userHeadVerifierId_idx" ON "Cpar"("userHeadVerifierId");

ALTER TABLE "Cpar" ADD CONSTRAINT "Cpar_userHeadVerifierId_fkey"
  FOREIGN KEY ("userHeadVerifierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: CPAR lama memakai aturan lama, yaitu pemegang USER_HEAD di departemen
-- penanggung jawab. Hanya diisi bila kandidatnya tepat satu — bila ada dua head di satu
-- departemen, memilihkan salah satunya berarti menebak, dan tebakan itu akan tercetak di
-- lembar tanda tangan. Yang kosong ditunjuk ulang lewat portal.
UPDATE "Cpar" c
SET "userHeadVerifierId" = kandidat.id
FROM (
  SELECT u."departmentId", min(u.id) AS id, count(*) AS jumlah
  FROM "User" u
  JOIN "UserRole" ur ON ur."userId" = u.id
  JOIN "Role" r ON r.id = ur."roleId"
  WHERE r.code = 'USER_HEAD' AND u."isActive" AND u."deletedAt" IS NULL
  GROUP BY u."departmentId"
) AS kandidat
WHERE c."responsibleDeptId" = kandidat."departmentId"
  AND kandidat.jumlah = 1
  AND c."userHeadVerifierId" IS NULL;
