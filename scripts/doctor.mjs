import { createConnection } from "node:net";
import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";

import "dotenv/config";
import pg from "pg";

/**
 * Memeriksa kesiapan lingkungan sebelum portal dipakai.
 *
 * Kegagalan pemasangan hampir selalu muncul sebagai satu gejala yang sama — tidak bisa
 * login — padahal sebabnya bisa .env yang belum diisi, PostgreSQL yang belum dinyalakan,
 * migrasi yang belum diterapkan, atau seed yang belum dijalankan. Daripada menebak satu
 * per satu, seluruhnya diperiksa sekaligus di sini.
 *
 *   node scripts/doctor.mjs
 *
 * Keluar dengan status 1 bila ada temuan yang menghalangi login, 0 bila hanya peringatan.
 */

const MIGRATIONS_DIR = path.resolve("prisma/migrations");
/** Sebagian tabel inti; cukup untuk membedakan "migrasi belum jalan" dari "basis data kosong". */
const CORE_TABLES = ["User", "Role", "Claim", "Department"];

let failures = 0;
let warnings = 0;

function ok(message) {
  console.log(`  ✓ ${message}`);
}

function fail(message, remedy) {
  failures += 1;
  console.log(`  ✗ ${message}`);
  if (remedy) console.log(`      → ${remedy}`);
}

function warn(message, remedy) {
  warnings += 1;
  console.log(`  ! ${message}`);
  if (remedy) console.log(`      → ${remedy}`);
}

async function exists(file) {
  return access(file).then(
    () => true,
    () => false,
  );
}

/** Mencoba membuka soket TCP; dipakai untuk layanan yang tidak perlu protokolnya diajak bicara. */
function portOpen(host, port, timeout = 1500) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeout);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

/**
 * Memastikan perintah dijalankan dari akar proyek.
 *
 * Salinan repositori yang bersarang membuat orang menjalankan `pnpm db:apply-sql` dari
 * folder pembungkus, tempat pnpm gagal karena tidak ada package.json — sementara portal
 * berjalan dari folder di dalamnya. Tanpa pemeriksaan ini, pesan "«.env» tidak ada" akan
 * menyarankan `pnpm env:init`, padahal yang salah adalah posisinya, bukan berkasnya.
 */
async function checkProjectRoot() {
  console.log("\nFolder proyek");

  const hasMigrations = await exists(MIGRATIONS_DIR);
  const hasPackage = await exists(path.resolve("package.json"));

  if (!hasMigrations || !hasPackage) {
    fail(
      "ini bukan akar proyek NCC Portal",
      "pindah ke folder yang berisi package.json dan prisma/, lalu ulangi",
    );
    return false;
  }

  ok("package.json dan prisma/migrations ditemukan");
  return true;
}

/**
 * Membandingkan umur hasil build dengan umur kodenya.
 *
 * `pnpm start` menyajikan isi .next apa adanya. Setelah `git pull`, route yang baru
 * belum ada di dalamnya sampai `pnpm build` dijalankan lagi — dan gejalanya adalah
 * halaman 404 pada menu yang kodenya jelas-jelas sudah ada. Tidak ada yang memberi
 * tahu; build yang basi tetap melayani permintaan seolah semuanya normal.
 */
async function checkBuildFreshness() {
  console.log("\nHasil build");

  const buildId = await stat(path.resolve(".next/BUILD_ID")).catch(() => null);

  if (!buildId) {
    warn(
      "belum pernah di-build",
      "wajib sebelum pnpm start; pnpm dev tidak memerlukannya",
    );
    return;
  }

  const newest = await newestSourceMtime();

  if (newest > buildId.mtimeMs) {
    const minutes = Math.round((newest - buildId.mtimeMs) / 60000);

    fail(
      `kode lebih baru daripada hasil build (selisih ${minutes} menit) — route baru akan 404`,
      "pnpm build, lalu jalankan ulang pnpm start",
    );
    return;
  }

  ok("hasil build lebih baru daripada kodenya");
}

/** Waktu ubah terakhir di antara berkas yang memengaruhi hasil build. */
async function newestSourceMtime() {
  const roots = ["src", "prisma/schema.prisma", "next.config.ts", "package.json"];
  let newest = 0;

  async function walk(target) {
    const info = await stat(target).catch(() => null);
    if (!info) return;

    if (info.isDirectory()) {
      const entries = await readdir(target, { withFileTypes: true });
      for (const entry of entries) {
        // src/generated diisi ulang `prisma generate` setiap pnpm install, jadi
        // waktunya tidak mencerminkan perubahan kode yang perlu di-build ulang.
        if (entry.name === "generated") continue;
        await walk(path.join(target, entry.name));
      }
      return;
    }

    newest = Math.max(newest, info.mtimeMs);
  }

  for (const root of roots) {
    await walk(path.resolve(root));
  }

  return newest;
}

async function checkEnv() {
  console.log("\nBerkas .env");

  if (!(await exists(path.resolve(".env")))) {
    fail(".env tidak ada", "pnpm env:init");
    return false;
  }

  ok(".env ada");

  const secret = process.env.AUTH_SECRET?.trim() ?? "";

  if (!secret) {
    fail("AUTH_SECRET kosong — seluruh login akan ditolak", "pnpm env:init");
  } else if (secret.length < 32) {
    warn(`AUTH_SECRET hanya ${secret.length} karakter`, "pnpm env:init --force");
  } else {
    ok("AUTH_SECRET terisi");
  }

  if (!process.env.DATABASE_URL?.trim()) {
    fail("DATABASE_URL kosong", "isi DATABASE_URL di .env");
    return false;
  }

  ok("DATABASE_URL terisi");
  checkHostBinding();

  return true;
}

/**
 * AUTH_URL yang menunjuk ke localhost adalah jebakan khusus akses dari perangkat lain:
 * Auth.js memakainya untuk seluruh redirect, jadi login dari peramban ponsel dilempar
 * balik ke localhost milik ponsel itu dan gagal tanpa pesan apa pun di layar.
 */
function checkHostBinding() {
  const authUrl = process.env.AUTH_URL?.trim();
  const appUrl = process.env.APP_URL?.trim();
  const isLoopback = (value) => /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(value);

  if (authUrl && isLoopback(authUrl)) {
    warn(
      `AUTH_URL diisi ${authUrl} — login dari perangkat lain akan dilempar ke sana dan gagal`,
      "kosongkan AUTH_URL di .env kecuali portal berada di belakang reverse proxy",
    );
  } else if (authUrl) {
    ok(`AUTH_URL disetel ke ${authUrl}`);
  } else {
    ok("AUTH_URL kosong — portal mengikuti host yang dipakai pengunjung");
  }

  if (appUrl && isLoopback(appUrl)) {
    warn(
      "APP_URL menunjuk ke localhost — tautan di email tidak dapat dibuka dari perangkat lain",
      "isi APP_URL dengan IP LAN mesin ini bila portal diakses dari ponsel",
    );
  }
}

async function checkDatabase() {
  console.log("\nBasis data");

  const url = new URL(process.env.DATABASE_URL);
  const host = url.hostname;
  const port = Number(url.port || 5432);

  if (!(await portOpen(host, port))) {
    fail(
      `tidak ada yang mendengarkan di ${host}:${port}`,
      "nyalakan PostgreSQL — Termux: pg_ctl -D $PREFIX/var/lib/postgresql start · Docker: pnpm db:up",
    );
    return;
  }

  ok(`${host}:${port} menerima koneksi`);

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(
      `koneksi ditolak: ${message}`,
      "periksa pengguna, kata sandi, dan nama basis data pada DATABASE_URL",
    );
    return;
  }

  ok(`masuk sebagai "${url.username}" ke basis data "${url.pathname.slice(1)}"`);

  try {
    // Memeriksa isi tabel yang belum ada hanya menghasilkan galat mentah, bukan temuan
    // yang bisa ditindaklanjuti — jadi pemeriksaan seed menunggu skemanya lengkap dulu.
    if (await checkSchema(client)) {
      await checkSeed(client);
    }
  } finally {
    await client.end();
  }
}

/** @returns {Promise<boolean>} true bila tabel inti sudah ada, sehingga isinya layak diperiksa. */
async function checkSchema(client) {
  const { rows } = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1)`,
    [CORE_TABLES],
  );
  const present = new Set(rows.map((row) => row.tablename));
  const missing = CORE_TABLES.filter((table) => !present.has(table));

  if (missing.length > 0) {
    fail(
      `tabel inti belum ada: ${missing.join(", ")}`,
      "pnpm db:apply-sql (Termux) atau pnpm db:migrate",
    );
    return false;
  }

  ok(`tabel inti lengkap (${CORE_TABLES.length} diperiksa)`);

  const folders = (await readdir(MIGRATIONS_DIR, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const applied = await client
    .query(`SELECT "migration_name" FROM "_prisma_migrations" WHERE "rolled_back_at" IS NULL`)
    .then(({ rows: migrations }) => new Set(migrations.map((row) => row.migration_name)))
    .catch(() => null);

  if (applied === null) {
    warn("_prisma_migrations tidak terbaca", "pnpm db:apply-sql");
    return true;
  }

  const pending = folders.filter((name) => !applied.has(name));

  if (pending.length > 0) {
    fail(`${pending.length} migrasi belum diterapkan: ${pending.join(", ")}`, "pnpm db:apply-sql");
  } else {
    ok(`${folders.length} migrasi sudah diterapkan`);
  }

  // Tabel intinya sudah ada, jadi isinya tetap layak diperiksa meski ada migrasi
  // tertunda — justru berguna untuk tahu apakah seed pernah dijalankan.
  return true;
}

async function checkSeed(client) {
  const { rows } = await client.query(
    `SELECT count(*) FILTER (WHERE "isActive") AS active, count(*) AS total FROM "User"`,
  );
  const active = Number(rows[0].active);
  const total = Number(rows[0].total);

  if (total === 0) {
    fail("tidak ada satu pun pengguna — tidak ada yang bisa login", "pnpm db:seed");
    return;
  }

  if (active === 0) {
    fail(`${total} pengguna ada, tapi semuanya nonaktif`, "aktifkan lewat pnpm db:studio");
    return;
  }

  ok(`${active} pengguna aktif dari ${total}`);
}

async function checkOptional() {
  console.log("\nOpsional");

  const smtpHost = process.env.SMTP_HOST?.trim() || "localhost";
  const smtpPort = Number(process.env.SMTP_PORT || 1025);

  if (await portOpen(smtpHost, smtpPort)) {
    ok(`SMTP ${smtpHost}:${smtpPort} menerima koneksi`);
  } else {
    warn(
      `SMTP ${smtpHost}:${smtpPort} tidak merespons — email gagal terkirim`,
      "pnpm mail:sink (atau pnpm db:up untuk MailHog)",
    );
  }

}

async function main() {
  console.log("Pemeriksaan lingkungan NCC Portal");
  // Disebutkan karena salinan repositori yang bersarang atau .env ganda membuat orang
  // memeriksa satu folder sambil menjalankan portal dari folder lain.
  console.log(`  folder: ${process.cwd()}`);

  if (await checkProjectRoot()) {
    await checkBuildFreshness();

    if (await checkEnv()) {
      await checkDatabase();
    }

    await checkOptional();
  }

  console.log("");

  if (failures > 0) {
    console.log(`${failures} masalah menghalangi login${warnings > 0 ? `, ${warnings} peringatan` : ""}.`);
    process.exitCode = 1;
    return;
  }

  console.log(
    warnings > 0
      ? `Siap dipakai, dengan ${warnings} peringatan di atas.`
      : "Semua pemeriksaan lolos. Jalankan pnpm dev.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
