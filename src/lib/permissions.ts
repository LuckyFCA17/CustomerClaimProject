import type { ClaimStatus, CparSectionKey, Prisma, RoleCode } from "@/generated/prisma/client";
import { ForbiddenError } from "@/lib/errors";

/**
 * Sumber kebenaran tunggal RBAC (§3, PLAN §2).
 *
 * Dipakai oleh tiga lapis penegakan:
 *   1. middleware.ts        — penjaga route kasar per prefix
 *   2. server action        — assertCan(actor, action, claim) sebelum assertTransition
 *   3. komponen UI          — menyembunyikan tombol yang tidak relevan
 *
 * Lapisan 3 bukan pengaman. Menyembunyikan tombol tidak menghentikan siapa pun yang
 * memanggil server action langsung; lapisan 2 yang menolaknya.
 */

// ─────────────────────────── Tipe konteks ───────────────────────────

export interface Actor {
  readonly id: string;
  readonly roles: readonly RoleCode[];
  readonly departmentId: string | null;
}

export interface ClaimContext {
  readonly status: ClaimStatus;
  readonly createdById: string;
  readonly cpar: {
    readonly responsibleDeptId: string;
    readonly cftMemberDeptIds: readonly string[];
  } | null;
}

/**
 * Cakupan hak sebuah role atas satu aksi:
 *   ALL   — berlaku untuk semua klaim
 *   OWNER — hanya klaim yang ia buat sendiri
 *   DEPT  — hanya klaim yang departemennya ditunjuk responsible atau anggota CFT
 */
export type Scope = "ALL" | "OWNER" | "DEPT";

// ─────────────────────────── Daftar aksi ───────────────────────────

export const ACTIONS = [
  "claim.view",
  "claim.create",
  "claim.update",
  "claim.submit",
  "claim.review.approve",
  "claim.review.revise",
  "claim.followUp",
  "claim.ignore",
  "claim.export",
  "cpar.view",
  "cpar.section.fill",
  "cpar.evidence.upload",
  "cpar.submitFinal",
  "cpar.verify",
  "cpar.print",
  "monitoring.start",
  "monitoring.evidence.upload",
  "monitoring.setEffectiveness",
  "monitoring.submitReport",
  "audit.view",
  "notification.viewLog",
  "master.manage",
  "user.manage",
] as const;

export type Action = (typeof ACTIONS)[number];

interface ActionRule {
  /** Role yang berhak, beserta cakupannya. Role yang tidak terdaftar selalu ditolak. */
  readonly roles: Partial<Record<RoleCode, Scope>>;
  /**
   * Status klaim yang mengizinkan aksi ini.
   * `"ANY"` = status apa pun. `null` = aksi tidak terikat klaim (mis. master data).
   */
  readonly statuses: readonly ClaimStatus[] | "ANY" | null;
}

const CPAR_PHASE_STATUSES = [
  "CPAR_ISSUED",
  "CPAR_IN_PROGRESS",
  "CPAR_UNDER_VERIFICATION",
  "CPAR_REVISION",
  "CPAR_APPROVED",
  "CAPA_MONITORING",
  "VERIFIED_CLOSED",
] as const satisfies readonly ClaimStatus[];

const CPAR_FILLING_STATUSES = [
  "CPAR_ISSUED",
  "CPAR_IN_PROGRESS",
  "CPAR_REVISION",
] as const satisfies readonly ClaimStatus[];

/** Sejak CPAR bisa dicetak — sebelum approved PDF diberi watermark "DRAFT" (§6 Modul 3). */
const CPAR_PRINTABLE_STATUSES = [
  "CPAR_IN_PROGRESS",
  "CPAR_UNDER_VERIFICATION",
  "CPAR_REVISION",
  "CPAR_APPROVED",
  "CAPA_MONITORING",
  "VERIFIED_CLOSED",
] as const satisfies readonly ClaimStatus[];

const READ_ONLY_FOR_EVERYONE: Partial<Record<RoleCode, Scope>> = {
  QA: "ALL",
  QA_HEAD: "ALL",
  USER_DEPT: "DEPT",
  USER_HEAD: "DEPT",
  FACTORY_MGR: "ALL",
  PRESDIR: "ALL",
  ADMIN: "ALL",
};

/**
 * Matriks ACTION × ROLE × STATUS.
 *
 * Catatan yang disengaja (asumsi A-06, dikonfirmasi):
 * ADMIN tidak boleh approve klaim maupun memverifikasi CPAR. Admin mengurus sistem,
 * bukan memutuskan mutu — kalau tidak, blok tanda tangan di PDF kehilangan maknanya.
 */
export const PERMISSION_MATRIX: Record<Action, ActionRule> = {
  "claim.view": { roles: READ_ONLY_FOR_EVERYONE, statuses: "ANY" },

  "claim.create": {
    roles: { QA: "ALL", QA_HEAD: "ALL", ADMIN: "ALL" },
    statuses: null,
  },
  "claim.update": {
    roles: { QA: "OWNER", ADMIN: "ALL" },
    statuses: ["DRAFT", "REVISION_REQUESTED"],
  },
  "claim.submit": {
    roles: { QA: "OWNER", ADMIN: "ALL" },
    statuses: ["DRAFT", "REVISION_REQUESTED"],
  },
  "claim.review.approve": {
    roles: { QA_HEAD: "ALL" },
    statuses: ["PENDING_QA_HEAD_REVIEW"],
  },
  "claim.review.revise": {
    roles: { QA_HEAD: "ALL" },
    statuses: ["PENDING_QA_HEAD_REVIEW"],
  },
  "claim.followUp": {
    roles: { QA: "ALL", QA_HEAD: "ALL" },
    statuses: ["PUBLISHED"],
  },
  "claim.ignore": {
    roles: { QA: "ALL", QA_HEAD: "ALL" },
    statuses: ["PUBLISHED"],
  },
  "claim.export": { roles: READ_ONLY_FOR_EVERYONE, statuses: "ANY" },

  "cpar.view": { roles: READ_ONLY_FOR_EVERYONE, statuses: CPAR_PHASE_STATUSES },
  "cpar.section.fill": {
    roles: { QA: "ALL", USER_DEPT: "DEPT", USER_HEAD: "DEPT" },
    statuses: CPAR_FILLING_STATUSES,
  },
  "cpar.evidence.upload": {
    roles: {
      QA: "ALL",
      QA_HEAD: "ALL",
      USER_DEPT: "DEPT",
      USER_HEAD: "DEPT",
      FACTORY_MGR: "ALL",
      PRESDIR: "ALL",
      ADMIN: "ALL",
    },
    statuses: CPAR_FILLING_STATUSES,
  },
  "cpar.submitFinal": {
    roles: { QA: "ALL", QA_HEAD: "ALL", ADMIN: "ALL" },
    statuses: ["CPAR_IN_PROGRESS", "CPAR_REVISION"],
  },
  "cpar.verify": {
    roles: { QA_HEAD: "ALL", USER_HEAD: "DEPT", FACTORY_MGR: "ALL", PRESDIR: "ALL" },
    statuses: ["CPAR_UNDER_VERIFICATION"],
  },
  "cpar.print": { roles: READ_ONLY_FOR_EVERYONE, statuses: CPAR_PRINTABLE_STATUSES },

  "monitoring.start": {
    roles: { QA: "ALL", QA_HEAD: "ALL", ADMIN: "ALL" },
    statuses: ["CPAR_APPROVED"],
  },
  "monitoring.evidence.upload": {
    roles: { QA: "ALL", USER_DEPT: "DEPT", USER_HEAD: "DEPT", ADMIN: "ALL" },
    statuses: ["CAPA_MONITORING"],
  },
  "monitoring.setEffectiveness": {
    roles: { FACTORY_MGR: "ALL", PRESDIR: "ALL" },
    statuses: ["CAPA_MONITORING"],
  },
  "monitoring.submitReport": {
    roles: { QA: "ALL", QA_HEAD: "ALL", ADMIN: "ALL" },
    statuses: ["CAPA_MONITORING"],
  },

  "audit.view": { roles: READ_ONLY_FOR_EVERYONE, statuses: "ANY" },
  "notification.viewLog": { roles: { QA_HEAD: "ALL", ADMIN: "ALL" }, statuses: null },
  "master.manage": { roles: { ADMIN: "ALL" }, statuses: null },
  "user.manage": { roles: { ADMIN: "ALL" }, statuses: null },
};

// ─────────────────────── Section CPAR → role pengisi ───────────────────────

/**
 * Asumsi A-03 (dikonfirmasi): Factory Manager dan President Director tidak mengisi
 * section mana pun — kontribusi mereka lewat cpar.verify dan monitoring.setEffectiveness.
 * Section yang bukan hak seseorang tampil read-only (§6 Modul 3).
 */
export const CPAR_SECTION_OWNERS: Record<CparSectionKey, readonly RoleCode[]> = {
  PROBLEM_DESCRIPTION: ["QA"],
  TEMPORARY_ACTION: ["USER_DEPT", "QA"],
  ROOT_CAUSE_OCCURRENCE: ["USER_DEPT"],
  ROOT_CAUSE_OUTFLOW: ["USER_DEPT"],
  PERMANENT_COUNTERMEASURE: ["USER_DEPT"],
  STANDARDIZATION_HORIZONTAL: ["USER_DEPT", "USER_HEAD"],
  EFFECTIVENESS_PLAN: ["USER_HEAD", "QA"],
};

/**
 * Verifier wajib per siklus (§5, asumsi A-01 & A-04 — keduanya dikonfirmasi).
 * Sama untuk semua tipe klaim; pada CPAR bertipe CFT hanya head lead dept yang wajib.
 */
export const REQUIRED_VERIFIER_ROLES = [
  "QA_HEAD",
  "USER_HEAD",
  "FACTORY_MGR",
  "PRESDIR",
] as const satisfies readonly RoleCode[];

export function requiredVerifierRoles(): readonly RoleCode[] {
  return REQUIRED_VERIFIER_ROLES;
}

// ─────────────────────────── Evaluasi ───────────────────────────

function isDeptInvolved(actor: Actor, claim: ClaimContext): boolean {
  if (!actor.departmentId || !claim.cpar) return false;

  return (
    claim.cpar.responsibleDeptId === actor.departmentId ||
    claim.cpar.cftMemberDeptIds.includes(actor.departmentId)
  );
}

function satisfiesScope(scope: Scope, actor: Actor, claim: ClaimContext | null): boolean {
  if (scope === "ALL") return true;
  if (!claim) return false;
  if (scope === "OWNER") return claim.createdById === actor.id;
  return isDeptInvolved(actor, claim);
}

/**
 * Klaim yang belum punya CPAR belum menunjuk departemen mana pun. Klaim PUBLISHED dan
 * IGNORED tetap terlihat oleh semua orang karena keduanya memicu broadcast ke seluruh
 * user portal (§8 #3 dan #5) — asumsi A-07.
 */
const BROADCAST_STATUSES = ["PUBLISHED", "IGNORED"] as const satisfies readonly ClaimStatus[];

function isBroadcastStatus(status: ClaimStatus): boolean {
  return (BROADCAST_STATUSES as readonly ClaimStatus[]).includes(status);
}

export function canViewClaim(actor: Actor, claim: ClaimContext): boolean {
  const deptScopedRoles: readonly RoleCode[] = ["USER_DEPT", "USER_HEAD"];
  const hasWideRole = actor.roles.some((role) => !deptScopedRoles.includes(role));

  if (hasWideRole) return true;
  if (isDeptInvolved(actor, claim)) return true;

  return isBroadcastStatus(claim.status);
}

export function can(actor: Actor, action: Action, claim: ClaimContext | null = null): boolean {
  const rule = PERMISSION_MATRIX[action];

  if (rule.statuses !== null) {
    if (!claim) return false;
    if (rule.statuses !== "ANY" && !rule.statuses.includes(claim.status)) return false;
    if (!canViewClaim(actor, claim)) return false;
  }

  return actor.roles.some((role) => {
    const scope = rule.roles[role];
    return scope !== undefined && satisfiesScope(scope, actor, claim);
  });
}

export function assertCan(actor: Actor, action: Action, claim: ClaimContext | null = null): void {
  if (!can(actor, action, claim)) {
    throw new ForbiddenError(`Anda tidak berhak melakukan "${action}" pada klaim ini.`, action);
  }
}

/** Apakah aktor boleh mengisi satu section CPAR tertentu (§6 Modul 3, PLAN §2.3). */
export function canFillSection(actor: Actor, section: CparSectionKey, claim: ClaimContext): boolean {
  if (!can(actor, "cpar.section.fill", claim)) return false;

  const owners = CPAR_SECTION_OWNERS[section];
  return actor.roles.some((role) => owners.includes(role));
}

export function assertCanFillSection(
  actor: Actor,
  section: CparSectionKey,
  claim: ClaimContext,
): void {
  if (!canFillSection(actor, section, claim)) {
    throw new ForbiddenError(
      `Section ${section} bukan bagian Anda; isian ini hanya dapat dibaca.`,
      "cpar.section.fill",
    );
  }
}

/**
 * Filter Prisma yang setara dengan `canViewClaim`, untuk dipakai di daftar klaim
 * dan hitungan dashboard. Keduanya diuji berpasangan di tests/unit/permissions.test.ts.
 */
export function visibleClaimsWhere(actor: Actor): Prisma.ClaimWhereInput {
  const deptScopedRoles: readonly RoleCode[] = ["USER_DEPT", "USER_HEAD"];
  const hasWideRole = actor.roles.some((role) => !deptScopedRoles.includes(role));

  if (hasWideRole) return {};

  if (!actor.departmentId) {
    return { status: { in: [...BROADCAST_STATUSES] } };
  }

  return {
    OR: [
      { cpar: { responsibleDeptId: actor.departmentId } },
      { cpar: { cftMembers: { some: { departmentId: actor.departmentId } } } },
      { status: { in: [...BROADCAST_STATUSES] } },
    ],
  };
}

/** Prefix route yang hanya boleh diakses role tertentu — dipakai middleware. */
export const ROUTE_GUARDS: readonly { readonly prefix: string; readonly roles: readonly RoleCode[] }[] = [
  { prefix: "/master", roles: ["ADMIN"] },
  { prefix: "/notifications", roles: ["QA_HEAD", "ADMIN"] },
];

export function routeAllowed(pathname: string, roles: readonly RoleCode[]): boolean {
  const guard = ROUTE_GUARDS.find(
    (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`),
  );

  if (!guard) return true;

  return guard.roles.some((role) => roles.includes(role));
}
