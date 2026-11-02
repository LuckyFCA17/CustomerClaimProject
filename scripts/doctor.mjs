import { createConnection } from "node:net";
import { access, readFile, readdir } from "node:fs/promises";
import { platform, totalmem } from "node:os";
import path from "node:path";

import "dotenv/config";
import pg from "pg";

import { buildState } from "./lib/build-freshness.mjs";

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

/**
 * Kebutuhan memori kedua mode, dalam MB.
 *
 * Diukur pada portal ini: `pnpm dev` menempati ±1.723 MB dalam keadaan diam, sedangkan
 * `pnpm start` menempati ±287 MB dan memuncak di ±343 MB saat menerima unggahan foto
 * 4,65 MB. Selisih enam kali lipat itu bukan beban aplikasinya, melainkan HMR, source
 * map, dan modul yang belum dikompilasi yang hanya ada di mode dev.
 *
 * Angkanya dipakai sebagai ambang peringatan, bukan ukuran pasti: beban sebenarnya
 * bergantung pada berapa banyak route yang sudah dikompilasi selama sesi berjalan.
 */
const DEV_MEMORY_MB = 1723;
const PROD_PEAK_MEMORY_MB = 343;
/** Kelonggaran di atas kebutuhan mode dev sebelum restart otomatisnya mulai terpicu. */
const DEV_HEADROOM_MB = 400;

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
  await checkStrayCopies();

  return true;
}

/**
 * Mencari salinan proyek dan lockfile liar di folder di atas proyek ini.
 *
 * Jebakan yang sudah terjadi di lapangan: `git clone` dijalankan dari dalam folder
 * bernama sama, menghasilkan `CustomerClaimProject/CustomerClaimProject`. Yang luar
 * tidak pernah di-`git pull` lagi, lalu Next — yang menentukan akar workspace dari
 * posisi lockfile — menyimpulkan akarnya ada di atas dan ikut membaca salinan basi itu.
 *
 * Gejalanya sangat menyesatkan: build gagal menyebut nomor baris yang tidak cocok dengan
 * berkas yang sedang dibuka, atau berhasil tetapi menyajikan kode lama. Tidak ada satu
 * pun pesan yang menyebut kata "salinan".
 */
async function checkStrayCopies() {
  const here = process.cwd();
  const strays = [];

  // Hanya ke atas; folder di bawah proyek adalah urusan proyek ini sendiri.
  for (let dir = path.dirname(here); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    if (await exists(path.join(dir, "pnpm-lock.yaml"))) strays.push(path.join(dir, "pnpm-lock.yaml"));
    if (await exists(path.join(dir, "prisma/migrations"))) strays.push(path.join(dir, "(salinan proyek)"));
  }

  if (strays.length === 0) {
    ok("tidak ada salinan proyek atau lockfile lain di folder di atasnya");
    return;
  }

  warn(
    `ada ${strays.length} lockfile/salinan proyek di folder di atas ini — Next dapat membaca kode dari salinan yang basi`,
    `hapus yang tidak dipakai: ${strays.join(" · ")}`,
  );
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

  const { state, minutesBehind } = await buildState();

  if (state === "missing") {
    warn("belum pernah di-build", "wajib sebelum pnpm start; pnpm dev tidak memerlukannya");
    return;
  }

  if (state === "stale") {
    fail(
      `kode lebih baru daripada hasil build (selisih ${minutesBehind} menit) — route baru akan 404`,
      "pnpm boot membangun ulang sendiri bila perlu",
    );
    return;
  }

  ok("hasil build lebih baru daripada kodenya");
}

async function checkPrismaClient() {
  console.log("\nPrisma Client");

  const schema = await readFile(path.resolve("prisma/schema.prisma"), "utf8").catch(() => null);

  if (schema === null) {
    fail("prisma/schema.prisma tidak terbaca", "pastikan berada di akar proyek");
    return;
  }

  const generated = await readFile(path.resolve("src/generated/prisma/enums.ts"), "utf8").catch(
    () => null,
  );

  if (generated === null) {
    fail("Prisma Client belum pernah dibuat", "pnpm exec prisma generate");
    return;
  }

  const declared = [...schema.matchAll(/^enum\s+(\w+)\s*\{/gm)].map((match) => match[1]);
  const missing = declared.filter((name) => !new RegExp(`\\b${name}\\b`).test(generated));

  if (missing.length > 0) {
    fail(
      `Prisma Client tertinggal dari schema — enum ${missing.join(", ")} belum ada di dalamnya`,
      "pnpm exec prisma generate, lalu build ulang",
    );
    return;
  }

  ok(`Prisma Client memuat ${declared.length} enum yang dideklarasikan schema`);
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

/**
 * Memori yang benar-benar tersedia, dalam MB.
 *
 * `os.freemem()` menyesatkan di Linux dan Android: memori yang dipakai page cache
 * terhitung "terpakai", padahal dilepas begitu ada yang membutuhkan. `MemAvailable` di
 * /proc/meminfo adalah perkiraan kernel sendiri tentang berapa yang benar-benar dapat
 * dialokasikan tanpa menukar ke swap, dan itulah angka yang menentukan di sini.
 */
async function availableMemoryMb() {
  const text = await readFile("/proc/meminfo", "utf8").catch(() => null);

  if (!text) return null;

  const match = /^MemAvailable:\s+(\d+) kB$/m.exec(text);

  return match ? Math.round(Number(match[1]) / 1024) : null;
}

/**
 * Apakah perangkat ini sanggup menjalankan mode dev.
 *
 * Pemeriksaan ini ada karena gejalanya menyesatkan. Saat memori menipis, Next mode dev
 * **me-restart dirinya sendiri** ("Server is approaching the used memory threshold,
 * restarting...") dan memutus seluruh koneksi yang sedang berjalan. Unggahan foto yang
 * sedang melintas ikut putus, dan di peramban hal itu muncul sebagai
 * `TypeError: Failed to fetch` — bukan sebagai pesan kehabisan memori. Tanpa petunjuk
 * ini, orang akan mencari bug di kode unggahnya, yang tidak ada.
 */
async function checkMemory() {
  console.log("\nMemori");

  const total = Math.round(totalmem() / 1024 / 1024);
  const available = await availableMemoryMb();
  const onAndroid = platform() === "android" || Boolean(process.env.TERMUX_VERSION);

  if (available === null) {
    // Hanya terjadi di sistem tanpa /proc; tidak cukup alasan untuk menggagalkan apa pun.
    ok(`RAM total ${total} MB (sisa tidak terbaca di sistem ini)`);
    return;
  }

  const label = `RAM ${total} MB, tersedia ${available} MB`;

  if (available >= DEV_MEMORY_MB + DEV_HEADROOM_MB) {
    ok(`${label} — cukup untuk pnpm dev (±${DEV_MEMORY_MB} MB)`);
    return;
  }

  if (available >= DEV_MEMORY_MB) {
    warn(
      `${label} — pas-pasan untuk pnpm dev (±${DEV_MEMORY_MB} MB)`,
      `unggah foto bisa terputus bila ada aplikasi lain berjalan; pnpm serve hanya butuh ±${PROD_PEAK_MEMORY_MB} MB`,
    );
    return;
  }

  warn(
    `${label} — di bawah kebutuhan pnpm dev (±${DEV_MEMORY_MB} MB)`,
    "pakai pnpm serve: mode dev akan me-restart dirinya sendiri saat memori menipis, " +
      "memutus unggahan yang sedang berjalan, dan di peramban itu terbaca sebagai " +
      '"Failed to fetch"',
  );

  if (onAndroid) {
    console.log(
      `      → di Termux jalankan termux-wake-lock lebih dulu; mode produksi memuncak di ±${PROD_PEAK_MEMORY_MB} MB saat mengunggah foto`,
    );
  }
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
    await checkPrismaClient();
    await checkBuildFreshness();
    await checkMemory();

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
