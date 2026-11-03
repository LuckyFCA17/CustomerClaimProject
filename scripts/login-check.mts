import "dotenv/config";

import bcrypt from "bcryptjs";

import { db } from "@/lib/db";
import { loginSchema } from "@/schemas/auth";

/**
 * Memeriksa satu akun langsung ke basis data, tanpa lewat layar login.
 *
 *   pnpm login:check dimas.prayoga@nifco.co.id
 *   pnpm login:check dimas.prayoga@nifco.co.id --password 'Nifco#2026'
 *   pnpm login:check --list
 *
 * Layar login sengaja menjawab satu kalimat yang sama untuk tiga keadaan berbeda —
 * email tidak terdaftar, akun dinonaktifkan, dan kata sandi salah — supaya tidak
 * membocorkan email mana yang ada di sistem. Itu benar untuk pemakai, tetapi membuat
 * pemiliknya ikut buta saat portal sendiri yang bermasalah.
 *
 * Skrip ini memakai Prisma Client dan bcrypt yang sama dengan `authorize()`, lalu
 * menyebutkan langkah mana yang gugur. Dijalankan di mesin portal, jadi tidak ada yang
 * dibocorkan ke siapa pun yang belum punya akses ke basis datanya.
 */

const DEMO_PASSWORD = "Nifco#2026";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  const value = index > -1 ? process.argv[index + 1] : undefined;

  return value && !value.startsWith("--") ? value : undefined;
}

const ok = (message: string) => console.log(`  ✓ ${message}`);
const bad = (message: string, remedy?: string) => {
  console.log(`  ✗ ${message}`);
  if (remedy) console.log(`      → ${remedy}`);
};

async function main(): Promise<void> {
  const total = await db.user.count();

  console.log("Pemeriksaan akun");
  console.log(`  basis data: ${new URL(process.env.DATABASE_URL ?? "postgres:///?").pathname.slice(1)}`);

  if (total === 0) {
    bad(
      "tabel User kosong — belum ada satu pun akun",
      "pnpm db:seed   (migrasi saja tidak mengisi data; pnpm boot pun tidak menjalankannya)",
    );
    return;
  }

  ok(`${total} akun terdaftar`);

  if (process.argv.includes("--list")) {
    const users = await db.user.findMany({
      select: { email: true, name: true, isActive: true },
      orderBy: { email: "asc" },
    });

    console.log("");
    for (const user of users) {
      console.log(`  ${user.isActive ? "aktif " : "NONAKTIF"}  ${user.email.padEnd(32)} ${user.name}`);
    }

    console.log("");
    return;
  }

  const raw = process.argv[2];

  if (!raw || raw.startsWith("--")) {
    console.log("\n  Sebutkan emailnya: pnpm login:check nama@nifco.co.id");
    console.log("  Atau lihat seluruh akun: pnpm login:check --list\n");
    return;
  }

  const password = arg("password") ?? DEMO_PASSWORD;

  // Dinormalkan persis seperti di layar login: email di-trim dan dihurufkecilkan di
  // sana, jadi memeriksa nilai mentah akan memberi jawaban yang berbeda dari kenyataan.
  const parsed = loginSchema.safeParse({ email: raw, password });

  if (!parsed.success) {
    bad(
      `masukan ditolak: ${parsed.error.issues.map((issue) => issue.message).join(" · ")}`,
      "perbaiki formatnya; layar login menolaknya lebih dulu, sebelum menyentuh basis data",
    );
    return;
  }

  const email = parsed.data.email;

  if (email !== raw) ok(`email dinormalkan menjadi "${email}"`);

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, isActive: true, passwordHash: true, lastLoginAt: true },
  });

  if (!user) {
    const near = await db.user.findMany({
      where: { email: { contains: email.split("@")[0].slice(0, 5), mode: "insensitive" } },
      select: { email: true },
      take: 3,
    });

    bad(
      `tidak ada akun dengan email "${email}"`,
      near.length
        ? `yang mirip: ${near.map((entry) => entry.email).join(" · ")}`
        : "pnpm login:check --list untuk melihat seluruh akun",
    );
    return;
  }

  ok(`akun ditemukan: ${user.name}`);

  if (!user.isActive) {
    bad(
      "akun dinonaktifkan — layar login menolaknya dengan pesan yang sama seperti sandi salah",
      "aktifkan lewat Data acuan → Pengguna, atau dengan Administrator lain",
    );
    return;
  }

  ok("akun aktif");

  if (!user.passwordHash || !user.passwordHash.startsWith("$2")) {
    bad(
      "kolom passwordHash kosong atau bukan hash bcrypt",
      "setel ulang kata sandinya lewat Data acuan → Pengguna, atau jalankan pnpm db:seed",
    );
    return;
  }

  const matches = await bcrypt.compare(parsed.data.password, user.passwordHash);

  if (!matches) {
    bad(
      "kata sandi tidak cocok dengan hash di basis data",
      arg("password")
        ? "coba kata sandi lain, atau setel ulang lewat Data acuan → Pengguna"
        : `yang dicoba adalah kata sandi seed (${DEMO_PASSWORD}); sebutkan yang lain dengan --password`,
    );
    return;
  }

  ok("kata sandi cocok");
  console.log(
    `\n  Akun ini seharusnya dapat masuk. Terakhir masuk: ${user.lastLoginAt?.toISOString() ?? "belum pernah"}.`,
  );
  console.log("  Bila layar login tetap menolak, sebabnya di luar pemeriksaan ini —");
  console.log("  lihat sepuluh baris teratas galat di terminal server.\n");
}

void main()
  .catch((error: unknown) => {
    console.error(`\n  Gagal menghubungi basis data lewat Prisma Client:`);
    console.error(`  ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    console.error("\n      Inilah yang juga dialami layar login: galat seperti ini ditangkap");
    console.error("      Auth.js dan muncul sebagai 'Email atau kata sandi salah'.");
    console.error("      Periksa PostgreSQL dengan pnpm checkup.\n");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
