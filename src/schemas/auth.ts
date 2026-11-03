import { z } from "zod";

/** Dipakai ulang di client (react-hook-form) dan server action Auth.js pada Fase 1. */
export const loginSchema = z.object({
  /**
   * Dinormalkan lebih dulu, baru divalidasi.
   *
   * Urutannya penting dan sempat terbalik di sini: `.email()` memeriksa nilai apa adanya,
   * sedangkan `.transform()` berjalan sesudahnya — sehingga alamat yang benar tetapi
   * membawa spasi di ujungnya ditolak sebagai "format tidak valid", lalu muncul di layar
   * sebagai "Email atau kata sandi salah". Papan ketik ponsel dan pengisi otomatis rutin
   * menambahkan spasi itu, jadi kegagalannya justru paling sering terjadi di perangkat
   * yang paling banyak dipakai di lantai produksi.
   */
  email: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
    z.string().min(1, "Email wajib diisi.").email("Format email tidak valid."),
  ),
  // Kata sandi tidak di-trim: spasi di awal atau akhir boleh menjadi bagian sandi yang sah.
  password: z.string().min(1, "Kata sandi wajib diisi."),
});

export type LoginInput = z.infer<typeof loginSchema>;
