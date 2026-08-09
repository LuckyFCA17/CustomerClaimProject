"use server";

import { AuthError } from "next-auth";

import { signIn, signOut } from "@/lib/auth";
import { loginSchema } from "@/schemas/auth";

export interface LoginState {
  readonly message?: string;
  /** Dikembalikan agar pengguna tidak perlu mengetik ulang emailnya setelah gagal. */
  readonly email?: string;
  /** Dinaikkan tiap percobaan supaya React memasang ulang input dengan nilai baru. */
  readonly attempt?: number;
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

/** Hanya path internal yang diterima, agar callbackUrl tidak bisa mengarahkan ke domain luar. */
function safeCallbackUrl(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";

  return value;
}

/**
 * Action untuk atribut `action` pada form login, dipakai lewat `useActionState`.
 *
 * Sengaja berupa server action dan bukan handler `onSubmit`: form yang belum sempat
 * ter-hydrate tetap mengirim POST ke server, bukan jatuh ke submit GET bawaan browser
 * yang akan menaruh email dan kata sandi di query string beserta riwayat peramban.
 */
export async function loginFormAction(prevState: LoginState, formData: FormData): Promise<LoginState> {
  const rawEmail = formData.get("email");
  // React mengosongkan form setelah server action selesai, jadi email dikembalikan
  // bersama galatnya — kata sandi sengaja tidak, agar tidak ikut terkirim balik.
  const echo = {
    email: typeof rawEmail === "string" ? rawEmail : "",
    attempt: (prevState.attempt ?? 0) + 1,
  };

  const parsed = loginSchema.safeParse({
    email: rawEmail,
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { ...echo, message: "Masukkan email yang valid beserta kata sandinya." };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: safeCallbackUrl(formData.get("callbackUrl")),
    });

    return {};
  } catch (error) {
    if (isRedirect(error)) throw error;

    if (error instanceof AuthError) {
      // Pesan sengaja seragam untuk email tidak terdaftar, kata sandi salah, dan akun
      // nonaktif — supaya halaman login tidak bisa dipakai menebak email yang terdaftar.
      return { ...echo, message: "Email atau kata sandi salah, atau akun Anda dinonaktifkan." };
    }

    throw error;
  }
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
