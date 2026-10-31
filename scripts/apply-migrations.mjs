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
 *   node scripts/apply-migrations.mjs [--dry-run] [--repair] [--reset]
 *
 * --dry-run  sebutkan apa yang akan diterapkan, tanpa mengubah apa pun
 * --repair   catatan migrasi ada tapi tabelnya tidak; ulangi dari awal (schema harus kosong)
 * --reset    HAPUS seluruh isi schema public lalu bangun ulang dari nol
 */

const MIGRATIONS_DIR = path.resolve("prisma/migrations");
const dryRun = process.argv.includes("--dry-run");
const reset = process.argv.includes("--reset");
const repair = process.argv.includes("--repair");

/** Sebagian tabel inti; cukup untuk membuktikan migrasi benar-benar menyentuh basis data. */
const CORE_TABLES = ["User", "Role", "Claim", "Department"];

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

/** Tabel inti yang benar-benar ada di schema public saat ini. */
async function existingCoreTables(client) {
  const { rows } = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1)`,
    [CORE_TABLES],
  );

  return rows.map((row) => row.tablename);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL belum diset. Salin .env.example ke .env terlebih dahulu.");
  }

  const client = new pg.Client({ connectionString });

  try {
    await client.connect();
  } catch (error) {
    // Perintah ini kini juga dijalankan `pnpm serve`, jadi pesannya harus menyebut
    // obatnya — bukan galat koneksi mentah di tengah rangkaian build.
    const reason = error instanceof Error ? error.message : String(error);

    throw new Error(
      `Tidak dapat terhubung ke basis data: ${reason}\n` +
        "  Nyalakan PostgreSQL lebih dulu — Termux: pg_ctl -D $PREFIX/var/lib/postgresql start",
    );
  }

  try {
    // PostgreSQL 15 ke atas tidak lagi memberi hak CREATE pada schema public kepada
    // semua orang. Tanpa pemeriksaan ini, migrasi pertama gagal di tengah dengan
    // "permission denied for schema public" — benar, tapi tidak menyebut obatnya.
    const { rows: grants } = await client.query(
      `SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS allowed`,
    );

    if (!grants[0].allowed) {
      throw new Error(
        `Pengguna basis data saat ini tidak boleh membuat tabel di schema public.\n` +
          `  Jalankan sebagai pemilik basis data:\n` +
          `    psql -d ${new URL(connectionString).pathname.slice(1)} ` +
          `-c "GRANT ALL ON SCHEMA public TO ${new URL(connectionString).username};"`,
      );
    }

    if (reset && !dryRun) {
      // Membangun ulang schema sekaligus menghapus _prisma_migrations, jadi catatan dan
      // isi basis data pasti kembali sejalan. Destruktif, dan hanya terjadi bila --reset
      // disebut secara eksplisit.
      console.log("  ! --reset: seluruh isi schema public dihapus");
      await client.query(`DROP SCHEMA public CASCADE`);
      await client.query(`CREATE SCHEMA public`);
    }

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

    if (repair && !reset && !dryRun) {
      // Mengosongkan catatan saja tidak cukup bila tabelnya masih separuh ada: migrasi
      // pertama akan berhenti di objek yang sudah eksis, dan basis data tertinggal lebih
      // kacau daripada sebelum perbaikan dimulai. Jadi diperiksa dulu, bukan sesudah.
      const leftovers = await existingCoreTables(client);

      if (leftovers.length > 0) {
        throw new Error(
          `Schema public masih berisi tabel ${leftovers.join(", ")}, jadi migrasi tidak bisa\n` +
            `  diulang dari awal. --repair hanya untuk schema yang sudah kosong.\n` +
            `  Untuk membangun ulang dari nol (SELURUH DATA HILANG): pnpm db:apply-sql --reset`,
        );
      }

      const { rowCount } = await client.query(`DELETE FROM "_prisma_migrations"`);
      console.log(`  · catatan migrasi dikosongkan (${rowCount} baris) — seluruhnya akan diulang`);
    }

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

    if (dryRun) {
      console.log("Pemeriksaan selesai; tidak ada yang diubah.");
      return;
    }

    // Catatan di _prisma_migrations bisa bertahan meski tabelnya hilang — misalnya
    // setelah schema public di-drop. Tanpa pemeriksaan ini skrip akan melaporkan
    // "sudah diterapkan" untuk basis data yang sebenarnya kosong, dan kegagalannya
    // baru muncul jauh kemudian sebagai "tidak bisa login".
    const present = await existingCoreTables(client);
    const missing = CORE_TABLES.filter((table) => !present.includes(table));

    if (missing.length > 0) {
      throw new Error(
        `Migrasi tercatat sudah diterapkan, tetapi tabel ${missing.join(", ")} tidak ada.\n` +
          `  Catatan migrasi tidak lagi mencerminkan isi basis data.\n` +
          `  Jalankan: pnpm db:apply-sql --repair`,
      );
    }

    console.log(`Selesai. ${count} migrasi baru diterapkan; tabel inti terverifikasi ada.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
