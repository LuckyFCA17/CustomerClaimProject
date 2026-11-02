import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { access } from "node:fs/promises";
import path from "node:path";

import "dotenv/config";

import { buildState } from "./lib/build-freshness.mjs";

/**
 * Menjalankan portal dalam mode produksi, membangun ulang hanya bila perlu.
 *
 *   pnpm boot              # satu perintah untuk pemakaian sehari-hari
 *   pnpm boot --force      # paksa build ulang walau hasilnya masih segar
 *
 * Ada karena pilihan antara `pnpm dev`, `pnpm start`, dan `pnpm serve` tidak pernah jelas
 * bagi yang hanya ingin memakai portalnya, dan salah pilih tidak gagal dengan jujur:
 *
 *   · `pnpm dev` menahan ±1.700 MB dan me-restart dirinya sendiri saat memori menipis,
 *     memutus unggahan yang sedang berjalan — di peramban terbaca "Failed to fetch";
 *   · `pnpm start` menyajikan isi .next apa adanya, jadi sesudah `git pull` ia menyajikan
 *     kode lama tanpa satu pun peringatan, atau menolak jalan karena belum pernah di-build;
 *   · `pnpm serve` selalu benar tetapi selalu membangun ulang, dan build itu sendiri
 *     memuncak di ±1.560 MB — mahal bila tidak ada yang berubah.
 *
 * Skrip ini memilihkan: membangun bila hasilnya hilang atau lebih tua daripada kodenya,
 * lalu menjalankan `next start` yang hanya butuh ±290 MB.
 */

const force = process.argv.includes("--force");

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: env ? { ...process.env, ...env } : process.env,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) return resolve();

      // Build yang dibunuh sistem keluar lewat sinyal, bukan kode — dan itulah yang
      // terjadi di perangkat ber-RAM kecil. Dibedakan supaya sarannya tepat.
      reject(
        signal
          ? new Error(`"${command} ${args.join(" ")}" dihentikan sistem (${signal})`)
          : new Error(`"${command} ${args.join(" ")}" gagal dengan kode ${code}`),
      );
    });
  });
}

function portOpen(host, port, timeout = 1500) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeout);
    socket.on("connect", () => done(true));
    socket.on("timeout", () => done(false));
    socket.on("error", () => done(false));
  });
}

/**
 * PostgreSQL diperiksa, bukan dinyalakan.
 *
 * Menyalakannya sendiri berarti menebak di mana datadir-nya berada, dan tebakan yang
 * salah membuat `pg_ctl` membuat cluster kedua yang kosong — basis datanya seolah
 * hilang. Perintah yang tepat dicetak saja; yang menjalankannya tetap manusia.
 */
async function requireDatabase() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    console.error("\n  DATABASE_URL belum diisi di .env — jalankan pnpm env:init dulu.\n");
    process.exit(1);
  }

  const parsed = new URL(url);
  const host = parsed.hostname || "localhost";
  const port = Number(parsed.port || 5432);

  if (await portOpen(host, port)) {
    console.log(`  ✓ PostgreSQL ${host}:${port} menerima koneksi`);
    return;
  }

  console.error(`\n  ✗ Tidak ada yang mendengarkan di ${host}:${port}.`);
  console.error("      Termux : pg_ctl -D $PREFIX/var/lib/postgresql start");
  console.error("      Docker : pnpm db:up");
  console.error("      Linux  : sudo service postgresql start\n");
  process.exit(1);
}

async function main() {
  const root = process.cwd();

  if (!(await access(path.join(root, "prisma/migrations")).then(() => true, () => false))) {
    console.error("\n  Ini bukan akar proyek NCC Portal — pindah ke folder yang berisi prisma/.\n");
    process.exit(1);
  }

  console.log("Menjalankan NCC Portal");
  console.log(`  folder: ${root}`);

  await requireDatabase();

  const { state, minutesBehind } = await buildState();
  const rebuild = force || state !== "fresh";

  if (!rebuild) {
    console.log("  ✓ hasil build masih lebih baru daripada kodenya — langsung dijalankan");
  } else {
    console.log(
      force
        ? "  · build ulang dipaksa (--force)"
        : state === "missing"
          ? "  · belum pernah di-build"
          : `  · kode ${minutesBehind} menit lebih baru daripada hasil build`,
    );

    // Urutan yang sama dengan pnpm serve: client, migrasi, lalu build.
    await run("pnpm", ["exec", "prisma", "generate"]);
    await run("node", ["scripts/apply-migrations.mjs"]);

    // Gerbang murah sebelum gerbang mahal. `tsc` sendirian 456 MB / 3 detik; galat yang
    // sama lewat `next build` baru ketahuan sesudah 1.649 MB / 72 detik. Build lalu
    // dijalankan dengan pemeriksaan dimatikan supaya tsc tidak berjalan dua kali.
    console.log("\n  Memeriksa tipe lebih dulu (murah — sekitar 3 detik)...");

    try {
      await run("pnpm", ["exec", "tsc", "--noEmit"]);
    } catch {
      console.error("\n  Ada galat tipe di atas; build dihentikan sebelum bagian yang mahal.");
      console.error("      Galat tipe pada kode yang tidak Anda sunting hampir selalu berarti");
      console.error("      isi folder tidak utuh — `git pull` yang berhenti di tengah");
      console.error("      meninggalkan sebagian berkas di versi lama.");
      console.error("      Periksa: pnpm checkup   lalu   git status\n");
      process.exitCode = 1;
      return;
    }

    console.log("\n  Membangun — ini bagian yang paling berat. Tutup aplikasi lain dan");
    console.log("  jangan buka peramban dulu; di ponsel build memuncak di sekitar 1.650 MB.\n");

    await run("pnpm", ["exec", "next", "build"], { NCC_BUILD_ONLY: "1" });
  }

  console.log("\n  Melayani di mode produksi (±290 MB). Tekan Ctrl+C untuk berhenti.\n");

  await run("pnpm", ["exec", "next", "start"]);
}

void main().catch((error) => {
  console.error(`\n  ${error instanceof Error ? error.message : String(error)}`);

  if (error instanceof Error && /dihentikan sistem/.test(error.message)) {
    console.error("      Build dibunuh sistem karena memori. Tutup aplikasi lain, jalankan");
    console.error("      termux-wake-lock, lalu ulangi — percobaan kedua memakai cache dan");
    console.error("      lebih ringan. Periksa sisa memori dengan pnpm checkup.");
  }

  console.error("");
  process.exitCode = 1;
});
