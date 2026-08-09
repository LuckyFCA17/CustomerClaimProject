"use server";

import { AuthError } from "next-auth";

import { signIn, signOut } from "@/lib/auth";
import { loginSchema } from "@/schemas/auth";

export interface LoginResult {
  readonly ok: boolean;
  readonly message?: string;
}

/**
 * `signIn` menandai keberhasilan dengan melempar redirect Next.js. Redirect itu harus
 * diteruskan apa adanya, bukan ditangkap sebagai kegagalan.
 */
function isRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function loginAction(input: unknown, callbackUrl?: string): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Email atau kata sandi tidak valid." };
  }

  // Hanya path internal yang diterima, agar callbackUrl tidak bisa dipakai
  // mengarahkan pengguna ke domain luar setelah login.
  const target = callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/dashboard";

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: target,
    });

    return { ok: true };
  } catch (error) {
    if (isRedirect(error)) throw error;

    if (error instanceof AuthError) {
      return {
        ok: false,
        message: "Email atau kata sandi salah, atau akun Anda dinonaktifkan.",
      };
    }

    throw error;
  }
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
