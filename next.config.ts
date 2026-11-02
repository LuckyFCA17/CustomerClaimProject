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
