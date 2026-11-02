import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

import { SERVER_ACTION_BODY_LIMIT_MB } from "./src/lib/uploads";

const nextConfig: NextConfig = {
  /**
   * Akar workspace ditetapkan, bukan disimpulkan.
   *
   * Next menebak akarnya dari posisi lockfile terdekat ke atas. Bila ada `pnpm-lock.yaml`
   * liar di folder induk — misalnya sisa `git clone` yang menghasilkan
   * `CustomerClaimProject/CustomerClaimProject` — tebakannya mendarat di folder home, dan
   * build ikut membaca salinan proyek yang sudah basi di sana. Gejalanya menyesatkan:
   * build gagal menyebut nomor baris yang tidak cocok dengan berkas yang sedang dibuka.
   */
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),

  /**
   * Melewati type check dan lint saat membangun, bila diminta lewat NCC_BUILD_ONLY=1.
   *
   * Dipakai `pnpm boot`, yang menjalankan `tsc` sendiri lebih dulu. Jadi pemeriksaannya
   * tidak dihilangkan, hanya dipindah ke depan supaya berjalan sekali, bukan dua kali.
   *
   * Yang membuat pemindahan ini sepadan adalah selisih ongkos gagalnya, bukan ongkos
   * berhasilnya. Terukur pada portal ini:
   *
   *     next build dengan type check + lint   1.649 MB   72 detik
   *     next build tanpa keduanya             1.699 MB   60 detik
   *     tsc --noEmit sendirian                  456 MB    3 detik
   *
   * Perhatikan baris kedua: melewati type check **tidak menghemat memori sama sekali** —
   * yang berat adalah kompilasinya. Dugaan bahwa type check-lah biang beratnya salah, dan
   * pengukuran inilah yang membatalkannya. Yang dihemat hanya waktu, dan itu pun sedikit.
   *
   * Nilainya ada di baris ketiga: galat tipe yang sama ketahuan dalam 3 detik pada 456 MB,
   * bukan sesudah 72 detik pada 1.649 MB. Di perangkat yang membunuh proses saat memori
   * menipis, build yang gagal di menit kedua adalah ongkos yang tidak perlu dibayar.
   *
   * Satu batasnya, supaya tidak disangka setara: `tsc` yang dijalankan sebelum build belum
   * melihat tipe route yang dihasilkan Next di `.next/types`, karena berkas itu baru lahir
   * saat build. Gerbangnya sedikit lebih longgar daripada milik Next, bukan sama persis.
   */
  typescript: { ignoreBuildErrors: process.env.NCC_BUILD_ONLY === "1" },
  eslint: { ignoreDuringBuilds: process.env.NCC_BUILD_ONLY === "1" },

  experimental: {
    // Mengaktifkan forbidden() dan unauthorized(), sehingga penolakan izin membalas
    // 403 dan 401 yang sebenarnya — bukan 500 dari galat yang tidak tertangkap.
    authInterrupts: true,

    serverActions: {
      // Bawaan Next adalah 1 MB, dan unggahan ditolak dengan HTTP 413 sebelum kode
      // aplikasi berjalan — foto kamera ponsel yang 3 MB tidak akan pernah sampai ke
      // saveUpload, padahal UPLOAD_LIMITS mengizinkan 10 MB. Keduanya disamakan dari
      // satu sumber di lib/uploads.ts agar tidak kembali berselisih.
      bodySizeLimit: `${SERVER_ACTION_BODY_LIMIT_MB}mb`,
    },
  },
};

export default nextConfig;
