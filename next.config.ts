import type { NextConfig } from "next";

import { SERVER_ACTION_BODY_LIMIT_MB } from "./src/lib/uploads";

const nextConfig: NextConfig = {
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
