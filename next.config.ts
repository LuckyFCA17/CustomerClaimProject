import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Mengaktifkan forbidden() dan unauthorized(), sehingga penolakan izin membalas
    // 403 dan 401 yang sebenarnya — bukan 500 dari galat yang tidak tertangkap.
    authInterrupts: true,
  },
};

export default nextConfig;
