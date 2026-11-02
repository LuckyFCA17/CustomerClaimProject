import { execFile } from "node:child_process";
import { promisify } from "node:util";

import pg from "pg";

/**
 * Basis data khusus E2E.
 *
 * Dipisah dari basis data pengembangan dengan sengaja. Pengujian ini memindahkan klaim
 * sampai `VERIFIED_CLOSED` dan menaikkan siklus CPAR — bila dijalankan atas data kerja,
 * ia merusak justru keadaan yang sedang dipakai orang untuk mencoba portal, dan
 * kerusakannya tidak kentara sampai seseorang mencari klaim yang statusnya berubah
 * sendiri.
 *
 * Nama basis datanya diturunkan dari DATABASE_URL yang berlaku, dengan akhiran `_e2e`,
 * supaya kredensial dan host-nya tidak perlu dikonfigurasi dua kali.
 */

const exec = promisify(execFile);

export function testDatabaseUrl(): string {
  const base = process.env.DATABASE_URL;

  if (!base) {
    throw new Error("DATABASE_URL belum diset — salin .env.example ke .env terlebih dahulu.");
  }

  const url = new URL(base);
  const name = url.pathname.replace(/^\//, "") || "ncc_portal";

  url.pathname = `/${name}_e2e`;

  return url.toString();
}

/** URL ke basis data `postgres`, dipakai untuk membuat basis data uji bila belum ada. */
function adminUrl(target: string): string {
  const url = new URL(target);

  url.pathname = "/postgres";

  return url.toString();
}

async function run(sql: string, connectionString: string): Promise<void> {
  const client = new pg.Client({ connectionString });

  await client.connect();

  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

/**
 * Menyiapkan basis data uji dari nol: dibuat bila belum ada, lalu skemanya dikosongkan,
 * migrasi diterapkan, dan seed dijalankan.
 *
 * Mengosongkan skema — bukan menghapus basis datanya — supaya koneksi yang menganggur
 * tidak menghalangi. `DROP DATABASE` gagal selama masih ada satu saja klien tersambung,
 * dan pada mesin pengembangan selalu ada.
 */
export async function resetTestDatabase(): Promise<string> {
  const url = testDatabaseUrl();
  const name = new URL(url).pathname.replace(/^\//, "");

  const admin = new pg.Client({ connectionString: adminUrl(url) });
  await admin.connect();

  try {
    const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);

    if (existing.rowCount === 0) {
      // Nama basis data tidak bisa diparameterkan; ia sudah diturunkan dari DATABASE_URL
      // milik pemilik mesin ini, bukan dari masukan luar.
      await admin.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
    }
  } finally {
    await admin.end();
  }

  await run("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;", url);

  const env = { ...process.env, DATABASE_URL: url };

  // Migrasi diterapkan lewat skrip SQL yang sama dengan yang dipakai di Termux, bukan
  // lewat `prisma migrate deploy` — supaya yang diuji adalah jalur yang benar-benar
  // dipakai memasang portal.
  await exec("node", ["scripts/apply-migrations.mjs"], { env, timeout: 120_000 });
  await exec("pnpm", ["exec", "tsx", "prisma/seed.ts"], { env, timeout: 180_000 });

  return url;
}
