import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bell,
  ClipboardCheck,
  Database,
  FileWarning,
  LayoutDashboard,
} from "lucide-react";

import { RoleCode } from "@/generated/prisma/enums";

/** Kode role (§3) — sumber kebenarannya enum Prisma `RoleCode`. */
export const ROLE_CODES = Object.values(RoleCode);

export type { RoleCode };

export const ROLE_LABEL: Record<RoleCode, string> = {
  QA: "QA Staff",
  QA_HEAD: "QA Dept. Head",
  USER_DEPT: "User Department",
  USER_HEAD: "User Dept. Head",
  FACTORY_MGR: "Factory Manager",
  PRESDIR: "President Director",
  ADMIN: "Administrator",
};

export interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Role yang boleh melihat menu ini. Kosong = semua role. */
  readonly roles?: readonly RoleCode[];
  /** Kunci penghitung badge "butuh tindakan"; diisi server pada Fase 7. */
  readonly badgeKey?: "claims" | "cpar" | "monitoring" | "notifications";
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/claims", label: "Claims", icon: FileWarning, badgeKey: "claims" },
  { href: "/cpar", label: "CPAR", icon: ClipboardCheck, badgeKey: "cpar" },
  { href: "/monitoring", label: "Monitoring", icon: Activity, badgeKey: "monitoring" },
  {
    href: "/notifications",
    label: "Notifications",
    icon: Bell,
    roles: ["QA_HEAD", "ADMIN"],
    badgeKey: "notifications",
  },
  { href: "/master", label: "Master Data", icon: Database, roles: ["ADMIN"] },
];

export function navItemsFor(roles: readonly RoleCode[]): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.some((role) => roles.includes(role)));
}

/** Menu dianggap aktif untuk dirinya sendiri dan seluruh sub-route-nya. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
