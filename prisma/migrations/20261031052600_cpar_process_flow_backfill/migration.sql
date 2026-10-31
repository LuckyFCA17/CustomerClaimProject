-- Melengkapi CPAR yang sudah ada dengan section PROCESS_FLOW.
--
-- Terpisah dari migrasi yang menambah nilai enum-nya: PostgreSQL menolak pemakaian
-- nilai enum baru di dalam transaksi yang sama dengan yang menambahkannya, dan
-- scripts/apply-migrations.mjs menjalankan tiap berkas dalam satu transaksi.
--
-- Tanpa pengisian ini, CPAR lama tidak akan punya barisnya sama sekali dan section
-- ketiga tidak muncul di formulir mereka.
INSERT INTO "CparSection" ("id", "cparId", "key", "isRequired", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."id", 'PROCESS_FLOW', true, now(), now()
FROM "Cpar" c
WHERE NOT EXISTS (
  SELECT 1 FROM "CparSection" s WHERE s."cparId" = c."id" AND s."key" = 'PROCESS_FLOW'
);
