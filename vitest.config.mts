import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // tsconfig.json memakai jsx: "preserve" karena Next yang mengompilasi JSX di aplikasi.
  // Pengujian tidak lewat Next, jadi transformasinya ditangani plugin ini — tanpa itu
  // template email tidak dapat diimpor oleh pengujian.
  plugins: [react()],
  resolve: {
    // Menghormati "paths" di tsconfig.json (@/* → src/*) tanpa plugin tambahan.
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
});
