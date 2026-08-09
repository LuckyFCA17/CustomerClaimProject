import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Menghormati "paths" di tsconfig.json (@/* → src/*) tanpa plugin tambahan.
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
});
