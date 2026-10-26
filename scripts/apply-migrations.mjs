import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import "dotenv/config";
import pg from "pg";

/**
 * Menerapkan migrasi Prisma tanpa schema-engine.
 *
 * `prisma migrate` menjalankan schema-engine, sebuah binary Rust yang hanya tersedia
 * untuk Linux glibc. Di Termux (Android, bionic libc) binary itu tidak dapat dijalankan,
 * sehingga basis data tidak bisa disiapkan dengan cara biasa.
 *
 * Skrip ini membaca berkas migration.sql yang sama persis, menjalankannya berurutan,
 * lalu mencatatnya di tabel _prisma_migrations dengan checksum yang sama seperti yang
 * ditulis Prisma. Dengan begitu basis data hasil Termux tetap dianggap mutakhir oleh
 * `prisma migrate status` di mesin biasa — bukan jalur bercabang yang nanti bentrok.
 *
 *   node scripts/apply-migrations.mjs [--dry-run]
 */

const MIGRATIONS_DIR = path.resolve("prisma/migrations");
const dryRun = process.argv.includes("--dry-run");

function checksumOf(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

async function migrationFolders() {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(); // nama folder diawali timestamp, jadi urutan abjad = urutan waktu
}

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL belum diset. Salin .env.example ke .env terlebih dahulu.");
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id"                  VARCHAR(36)  PRIMARY KEY,
        "checksum"            VARCHAR(64)  NOT NULL,
        "finished_at"         TIMESTAMPTZ,
        "migration_name"      VARCHAR(255) NOT NULL,
        "logs"                TEXT,
        "rolled_back_at"      TIMESTAMPTZ,
        "started_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER      NOT NULL DEFAULT 0
      )
    `);

    const { rows } = await client.query(
      `SELECT "migration_name" FROM "_prisma_migrations" WHERE "rolled_back_at" IS NULL`,
    );
    const applied = new Set(rows.map((row) => row.migration_name));

    const folders = await migrationFolders();
    let count = 0;

    for (const name of folders) {
      if (applied.has(name)) {
        console.log(`  · ${name} — sudah diterapkan`);
        continue;
      }

      const sql = await readFile(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");

      if (dryRun) {
        console.log(`  · ${name} — akan diterapkan (${sql.split(";").length - 1} statement)`);
        continue;
      }

      // Satu migrasi = satu transaksi. Kalau gagal di tengah, basis data tidak
      // tertinggal separuh jalan tanpa catatan.
      await client.query("BEGIN");

      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO "_prisma_migrations"
             ("id", "checksum", "migration_name", "started_at", "finished_at", "applied_steps_count")
           VALUES ($1, $2, $3, now(), now(), 1)`,
          [randomUUID(), checksumOf(sql), name],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Migrasi ${name} gagal: ${error instanceof Error ? error.message : error}`);
      }

      console.log(`  · ${name} — diterapkan`);
      count += 1;
    }

    console.log(
      dryRun
        ? "Pemeriksaan selesai; tidak ada yang diubah."
        : `Selesai. ${count} migrasi baru diterapkan.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
