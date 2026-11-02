// Konfigurasi dibaca sebelum global setup berjalan, jadi .env harus dimuat di sini —
// bukan di global-setup.ts — agar DATABASE_URL sudah ada saat webServer disusun.
import "dotenv/config";

import { defineConfig, devices } from "@playwright/test";

import { testDatabaseUrl } from "./tests/e2e/database";

/**
 * Konfigurasi E2E (§7 Fase 8).
 *
 * Tiga keputusan yang menentukan keandalannya:
 *
 *  · **Satu worker, tanpa paralel.** Pengujian ini memindahkan satu klaim melewati
 *    seluruh state machine; dua worker yang berbagi satu basis data akan saling mengubah
 *    status klaim yang sedang diperiksa yang lain.
 *  · **Basis data sendiri.** Lihat `tests/e2e/database.ts` — data pengembangan tidak
 *    boleh ikut berpindah status.
 *  · **Port sendiri (3100).** Server pengembangan di 3000 boleh tetap menyala; E2E tidak
 *    boleh menumpang padanya karena ia menunjuk ke basis data yang berbeda.
 */

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",

  // Alur ini panjang: satu berkas uji melewati delapan perpindahan status.
  timeout: 180_000,
  expect: { timeout: 15_000 },

  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,

  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          // Peramban disediakan lingkungan, bukan oleh `playwright install`: versi yang
          // diunduh sendiri tidak akan menemukan binary yang sudah terpasang di sini.
          executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium",
          args: ["--no-sandbox", "--no-proxy-server"],
        },
      },
    },
  ],

  webServer: {
    // Mode produksi, bukan dev: itu yang dipakai di lapangan, dan dev mode me-restart
    // dirinya sendiri saat memori menipis — persis di tengah alur yang sedang diuji.
    command: `pnpm exec next start --port ${PORT}`,
    url: `${BASE_URL}/login`,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      DATABASE_URL: testDatabaseUrl(),
      // Auth.js memakai AUTH_URL untuk seluruh redirect; dibiarkan menunjuk ke 3000,
      // login pada port uji akan dilempar ke server lain dan gagal tanpa pesan.
      AUTH_URL: BASE_URL,
      APP_URL: BASE_URL,
      // Penyimpanan sendiri: nomor klaim diulang dari awal tiap kali basis data uji
      // direset, dan folder lampiran sisa jalannya yang lalu akan bertabrakan dengannya.
      STORAGE_ROOT: "./storage/e2e-uploads",
      NODE_ENV: "production",
    },
  },
});
