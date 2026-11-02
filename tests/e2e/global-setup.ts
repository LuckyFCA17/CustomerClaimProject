import { rm } from "node:fs/promises";

import "dotenv/config";

import { resetTestDatabase } from "./database";

/**
 * Menyiapkan basis data uji sebelum server E2E dinyalakan.
 *
 * Dijalankan sekali per `pnpm test:e2e`, bukan per berkas uji: alur yang diuji berjalan
 * berurutan di atas satu klaim, dan mengosongkan basis data di tengahnya akan menghapus
 * klaim yang sedang dipakai berkas berikutnya.
 */
export default async function globalSetup(): Promise<void> {
  // Lampiran ikut dikosongkan; basis data yang direset membuat penomoran klaim mulai
  // lagi dari 0001, dan folder sisa jalannya yang lalu memakai nomor yang sama.
  await rm("storage/e2e-uploads", { recursive: true, force: true });

  const url = await resetTestDatabase();
  const name = new URL(url).pathname.replace(/^\//, "");

  console.log(`  basis data uji siap: ${name} (migrasi + seed)`);
}
