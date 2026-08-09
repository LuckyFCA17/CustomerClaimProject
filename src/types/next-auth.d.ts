import type { DefaultSession } from "next-auth";

import type { RoleCode } from "@/generated/prisma/enums";

/** Data yang ikut di JWT dan sesi, supaya RBAC tidak perlu query DB tiap request. */
interface PortalClaims {
  roles: RoleCode[];
  jobTitle: string;
  departmentId: string | null;
  departmentCode: string | null;
}

declare module "next-auth" {
  interface User extends PortalClaims {
    id?: string;
    name?: string | null;
    email?: string | null;
  }

  interface Session {
    user: PortalClaims & { id: string } & DefaultSession["user"];
  }
}

// Tipe JWT sengaja tidak diperluas: Auth.js mendefinisikannya sebagai
// Record<string, unknown> dan isinya datang dari cookie klien. lib/auth.config.ts
// membacanya dengan penyempitan tipe eksplisit supaya token rusak tidak lolos.

export {};
