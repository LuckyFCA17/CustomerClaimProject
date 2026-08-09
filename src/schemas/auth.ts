import { z } from "zod";

/** Dipakai ulang di client (react-hook-form) dan server action Auth.js pada Fase 1. */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email wajib diisi.")
    .email("Format email tidak valid.")
    .transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1, "Kata sandi wajib diisi."),
});

export type LoginInput = z.infer<typeof loginSchema>;
