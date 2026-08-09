import type { NextAuthConfig } from "next-auth";

import { RoleCode } from "@/generated/prisma/enums";

/**
 * Bagian konfigurasi Auth.js yang bebas Node API dan bebas Prisma, sehingga aman
 * dijalankan middleware di edge runtime. Provider credentials (butuh bcrypt + database)
 * ditambahkan terpisah di lib/auth.ts yang hanya berjalan di server Node.
 *
 * Isi JWT bertipe `Record<string, unknown>` di Auth.js dan berasal dari cookie yang
 * dikirim klien, jadi klaimnya dibaca lewat penyempitan tipe eksplisit di bawah —
 * token lama atau token yang dirusak menghasilkan nilai kosong, bukan crash.
 */

const KNOWN_ROLES = new Set<string>(Object.values(RoleCode));

function readRoles(value: unknown): RoleCode[] {
  if (!Array.isArray(value)) return [];

  return value.filter((entry): entry is RoleCode => typeof entry === "string" && KNOWN_ROLES.has(entry));
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    // Satu shift kerja. Setelah itu pengguna masuk kembali.
    maxAge: 60 * 60 * 9,
  },
  callbacks: {
    jwt({ token, user }) {
      // `user` hanya terisi pada request sign-in; sesudahnya token yang dipakai ulang.
      if (user) {
        token.sub = user.id ?? token.sub;
        token.roles = user.roles;
        token.jobTitle = user.jobTitle;
        token.departmentId = user.departmentId;
        token.departmentCode = user.departmentCode;
      }

      return token;
    },
    session({ session, token }) {
      session.user.id = readString(token.sub);
      session.user.roles = readRoles(token.roles);
      session.user.jobTitle = readString(token.jobTitle);
      session.user.departmentId = readNullableString(token.departmentId);
      session.user.departmentCode = readNullableString(token.departmentCode);

      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
