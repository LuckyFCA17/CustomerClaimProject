import type { ClaimStatus, RoleCode } from "@/generated/prisma/enums";
import { IllegalTransitionError } from "@/lib/errors";
import type { Action } from "@/lib/permissions";

/**
 * State machine klaim (§5) — jantung aplikasi.
 *
 * Tabel di bawah adalah satu-satunya daftar perpindahan status yang sah. Apa pun yang
 * tidak ada di sini ditolak, termasuk ketika server action dipanggil langsung tanpa lewat
 * UI (kriteria penerimaan #3). Menyembunyikan tombol bukan pengaman.
 *
 * Pemeriksaan role di sini sengaja menggandakan matriks izin: `assertCan` menjawab
 * "boleh melakukan aksi ini?", sedangkan `assertTransition` menjawab "perpindahan status
 * ini sah bagi kapasitas tersebut?". Keduanya harus lolos, sehingga satu kekeliruan di
 * salah satu tabel tidak cukup untuk melompati tahap.
 */

export interface Transition {
  readonly from: ClaimStatus;
  readonly to: ClaimStatus;
  /** Aksi pada matriks izin yang memicu perpindahan ini. */
  readonly action: Action;
  /** Kapasitas yang boleh memicu. Role lain ditolak meski aksinya diizinkan. */
  readonly roles: readonly RoleCode[];
  /** Label tombol dan nama aksi di audit trail — kata kerja spesifik (§10). */
  readonly label: string;
}

export const TRANSITIONS: readonly Transition[] = [
  // ── Modul 1: informasi klaim ────────────────────────────────────────────
  {
    from: "DRAFT",
    to: "PENDING_QA_HEAD_REVIEW",
    action: "claim.submit",
    roles: ["QA", "ADMIN"],
    label: "Submit claim information",
  },
  {
    from: "REVISION_REQUESTED",
    to: "PENDING_QA_HEAD_REVIEW",
    action: "claim.submit",
    roles: ["QA", "ADMIN"],
    label: "Submit claim information",
  },
  {
    from: "PENDING_QA_HEAD_REVIEW",
    to: "REVISION_REQUESTED",
    action: "claim.review.revise",
    roles: ["QA_HEAD"],
    label: "Request revision",
  },
  {
    from: "PENDING_QA_HEAD_REVIEW",
    to: "PUBLISHED",
    action: "claim.review.approve",
    roles: ["QA_HEAD"],
    label: "Approve claim",
  },

  // ── Modul 2: penetapan penanggung jawab ─────────────────────────────────
  {
    from: "PUBLISHED",
    to: "CPAR_ISSUED",
    action: "claim.followUp",
    roles: ["QA", "QA_HEAD"],
    label: "Submit problem countermeasure request",
  },
  {
    from: "PUBLISHED",
    to: "IGNORED",
    action: "claim.ignore",
    roles: ["QA", "QA_HEAD"],
    label: "Ignore claim",
  },

  // ── Modul 3: pengisian dan verifikasi CPAR ──────────────────────────────
  {
    from: "CPAR_ISSUED",
    to: "CPAR_IN_PROGRESS",
    action: "cpar.section.fill",
    roles: ["QA", "USER_DEPT", "USER_HEAD"],
    label: "Save update",
  },
  {
    from: "CPAR_IN_PROGRESS",
    to: "CPAR_UNDER_VERIFICATION",
    action: "cpar.submitFinal",
    roles: ["QA", "QA_HEAD", "ADMIN"],
    label: "Submit CPAR final report",
  },
  {
    from: "CPAR_REVISION",
    to: "CPAR_UNDER_VERIFICATION",
    action: "cpar.submitFinal",
    roles: ["QA", "QA_HEAD", "ADMIN"],
    label: "Submit CPAR final report",
  },
  {
    from: "CPAR_UNDER_VERIFICATION",
    to: "CPAR_REVISION",
    action: "cpar.verify",
    roles: ["QA_HEAD", "USER_HEAD", "FACTORY_MGR", "PRESDIR"],
    label: "Needs revision",
  },
  {
    from: "CPAR_UNDER_VERIFICATION",
    to: "CPAR_APPROVED",
    action: "cpar.verify",
    roles: ["QA_HEAD", "USER_HEAD", "FACTORY_MGR", "PRESDIR"],
    label: "Verify CPAR",
  },

  // ── Modul 4: monitoring CAPA ────────────────────────────────────────────
  {
    from: "CPAR_APPROVED",
    to: "CAPA_MONITORING",
    action: "monitoring.start",
    roles: ["QA", "QA_HEAD", "ADMIN"],
    label: "Start CAPA monitoring",
  },
  {
    from: "CAPA_MONITORING",
    to: "CPAR_REVISION",
    action: "monitoring.setEffectiveness",
    roles: ["FACTORY_MGR", "PRESDIR"],
    label: "Mark period not effective",
  },
  {
    from: "CAPA_MONITORING",
    to: "VERIFIED_CLOSED",
    action: "monitoring.submitReport",
    roles: ["QA", "QA_HEAD", "ADMIN"],
    label: "Submit improvement monitoring report",
  },
];

/** Status akhir; tidak ada perpindahan keluar. Pembatalan diwakili IGNORED, bukan penghapusan. */
export const TERMINAL_STATUSES = ["IGNORED", "VERIFIED_CLOSED"] as const satisfies readonly ClaimStatus[];

export function isTerminal(status: ClaimStatus): boolean {
  return (TERMINAL_STATUSES as readonly ClaimStatus[]).includes(status);
}

export function findTransition(from: ClaimStatus, to: ClaimStatus): Transition | undefined {
  return TRANSITIONS.find((entry) => entry.from === from && entry.to === to);
}

/** Seluruh perpindahan yang mungkin dari sebuah status, apa pun pelakunya. */
export function transitionsFrom(from: ClaimStatus): readonly Transition[] {
  return TRANSITIONS.filter((entry) => entry.from === from);
}

/** Perpindahan yang tersedia bagi kapasitas tertentu — dipakai merender tombol aksi. */
export function availableTransitions(
  from: ClaimStatus,
  actorRoles: readonly RoleCode[],
): readonly Transition[] {
  return transitionsFrom(from).filter((entry) => entry.roles.some((role) => actorRoles.includes(role)));
}

/**
 * Menolak perpindahan yang tidak ada di tabel, atau yang tidak boleh dipicu kapasitas
 * pemanggil. Wajib dipanggil setiap server action sebelum menulis status baru.
 */
export function assertTransition(
  from: ClaimStatus,
  to: ClaimStatus,
  actorRoles: readonly RoleCode[],
): Transition {
  if (isTerminal(from)) {
    throw new IllegalTransitionError(
      from,
      to,
      `Klaim sudah berstatus ${from} dan tidak dapat diubah lagi.`,
    );
  }

  const transition = findTransition(from, to);

  if (!transition) {
    throw new IllegalTransitionError(from, to);
  }

  if (!transition.roles.some((role) => actorRoles.includes(role))) {
    throw new IllegalTransitionError(
      from,
      to,
      `Role Anda tidak berwenang menjalankan "${transition.label}".`,
    );
  }

  return transition;
}
