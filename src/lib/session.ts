import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { UnauthorizedError } from "@/lib/errors";
import type { Actor } from "@/lib/permissions";
import type { RoleCode } from "@/generated/prisma/enums";

export interface PortalUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly jobTitle: string;
  readonly departmentId: string | null;
  readonly departmentCode: string | null;
  readonly roles: readonly RoleCode[];
}

async function readSessionUser(): Promise<PortalUser | null> {
  const session = await auth();
  const user = session?.user;

  if (!user?.id) return null;

  return {
    id: user.id,
    name: user.name ?? "",
    email: user.email ?? "",
    jobTitle: user.jobTitle,
    departmentId: user.departmentId,
    departmentCode: user.departmentCode,
    roles: user.roles,
  };
}

/**
 * Pengguna aktif untuk halaman portal. Mengarahkan ke /login bila tidak ada sesi —
 * middleware sudah menjaga hal yang sama, ini pengaman kedua untuk render langsung.
 */
export async function getPortalUser(): Promise<PortalUser> {
  const user = await readSessionUser();
  if (!user) redirect("/login");

  return user;
}

/**
 * Pengguna aktif untuk server action. Melempar 401 alih-alih redirect, karena pemanggilnya
 * mengharapkan galat terstruktur, bukan navigasi.
 */
export async function requireActor(): Promise<Actor & PortalUser> {
  const user = await readSessionUser();
  if (!user) throw new UnauthorizedError();

  return user;
}
