import type { RoleCode } from "@/config/navigation";

export interface PortalUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly jobTitle: string;
  readonly departmentCode: string | null;
  readonly roles: readonly RoleCode[];
}

/**
 * Pengguna aktif untuk shell portal.
 *
 * FASE 0: mengembalikan pengguna contoh agar layout dapat ditinjau secara visual.
 * FASE 1 mengganti isi fungsi ini dengan `auth()` dari Auth.js (session JWT) dan
 * mengarahkan ke /login bila tidak ada sesi — pemanggilnya tidak perlu berubah.
 */
export async function getPortalUser(): Promise<PortalUser> {
  return {
    id: "preview-user",
    name: "Rina Kusuma",
    email: "rina.kusuma@nifco.co.id",
    jobTitle: "QA Dept. Head",
    departmentCode: "QA",
    roles: ["QA_HEAD", "QA"],
  };
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
