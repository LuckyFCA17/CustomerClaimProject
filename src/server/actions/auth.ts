"use server";

import { AuthError, CredentialsSignin } from "next-auth";

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
 * Memeriksa konfigurasi yang wajib ada sebelum login dicoba.
 *
 * Tanpa ini, AUTH_SECRET yang kosong membuat Auth.js menjawab "There was a problem with
 * the server configuration" — benar, tapi tidak memberi tahu apa yang harus diperbaiki,
 * dan sebabnya hanya terlihat di log server yang biasanya tidak sedang dibuka.
 */
function configurationProblem(): string | null {
  if (!process.env.AUTH_SECRET?.trim()) {
    return (
      "AUTH_SECRET belum diisi pada berkas .env. Buat nilainya dengan " +
      '`node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"`, ' +
      "isikan ke AUTH_SECRET, lalu jalankan ulang server."
    );
  }

  if (!process.env.DATABASE_URL?.trim()) {
    return "DATABASE_URL belum diisi pada berkas .env.";
  }

  return null;
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

  const misconfiguration = configurationProblem();

  if (misconfiguration) {
    return { ...echo, message: misconfiguration };
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

    if (error instanceof CredentialsSignin) {
      // Pesan sengaja seragam untuk email tidak terdaftar, kata sandi salah, dan akun
      // nonaktif — supaya halaman login tidak bisa dipakai menebak email yang terdaftar.
      return { ...echo, message: "Email atau kata sandi salah, atau akun Anda dinonaktifkan." };
    }

    if (error instanceof AuthError) {
      // Konfigurasi yang salah dan basis data yang tidak terjangkau sebelumnya ikut
      // terbaca sebagai "kata sandi salah", sehingga pengguna mencari masalah di tempat
      // yang keliru. Keduanya dipisahkan: isinya tetap tidak membocorkan apa pun tentang
      // akun, tapi menunjuk ke log server tempat sebabnya tercatat.
      console.error(`[login] kegagalan non-kredensial (${error.type}):`, error);

      return {
        ...echo,
        message:
          "Login gagal karena masalah konfigurasi server, bukan karena kata sandi Anda. " +
          "Periksa log server untuk rinciannya.",
      };
    }

    throw error;
  }
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
