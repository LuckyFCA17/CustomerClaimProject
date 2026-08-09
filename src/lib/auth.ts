import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { authConfig } from "@/lib/auth.config";
import { db } from "@/lib/db";
import { loginSchema } from "@/schemas/auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
          include: {
            department: { select: { code: true } },
            roles: { include: { role: { select: { code: true } } } },
          },
        });

        // Pengguna nonaktif diperlakukan sama dengan pengguna yang tidak ada:
        // pesan galatnya seragam agar tidak membocorkan email mana yang terdaftar.
        if (!user || !user.isActive) return null;

        const passwordMatches = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!passwordMatches) return null;

        await db.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          jobTitle: user.jobTitle,
          departmentId: user.departmentId,
          departmentCode: user.department?.code ?? null,
          roles: user.roles.map((entry) => entry.role.code),
        };
      },
    }),
  ],
});
