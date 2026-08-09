/**
 * Definisi status klaim untuk kebutuhan tampilan.
 *
 * Fase 1 akan memindahkan sumber kebenaran status ke enum Prisma `ClaimStatus`;
 * file ini tetap ada sebagai lapisan presentasi (label, warna, posisi di status rail),
 * dan `tests/unit/claim-status.test.ts` menjaga keduanya tidak pernah berbeda.
 */

export const CLAIM_STATUSES = [
  "DRAFT",
  "PENDING_QA_HEAD_REVIEW",
  "REVISION_REQUESTED",
  "PUBLISHED",
  "IGNORED",
  "CPAR_ISSUED",
  "CPAR_IN_PROGRESS",
  "CPAR_UNDER_VERIFICATION",
  "CPAR_REVISION",
  "CPAR_APPROVED",
  "CAPA_MONITORING",
  "VERIFIED_CLOSED",
] as const;

export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/** Keluarga warna status (§10). Dipakai konsisten di badge, timeline, dan grafik. */
export type StatusTone = "draft" | "pending" | "published" | "monitoring" | "closed" | "ignored" | "danger";

export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  draft: "bg-[var(--status-draft-bg)] text-[var(--status-draft)]",
  pending: "bg-[var(--status-pending-bg)] text-[var(--status-pending)]",
  published: "bg-[var(--status-published-bg)] text-[var(--status-published)]",
  monitoring: "bg-[var(--status-monitoring-bg)] text-[var(--status-monitoring)]",
  closed: "bg-[var(--status-closed-bg)] text-[var(--status-closed)]",
  ignored: "bg-[var(--status-ignored-bg)] text-[var(--status-ignored)]",
  danger: "bg-[var(--status-danger-bg)] text-[var(--status-danger)]",
};

/** Tahap pada status rail (§10) — pita horizontal di atas halaman detail klaim. */
export const RAIL_STAGES = [
  "Claim",
  "Review",
  "Published",
  "CPAR",
  "Verification",
  "Monitoring",
  "Closed",
] as const;

export type RailStage = (typeof RAIL_STAGES)[number];

export interface ClaimStatusMeta {
  /** Label Inggris, mengikuti istilah form aslinya (§10). */
  readonly label: string;
  readonly tone: StatusTone;
  /** Indeks tahap yang sedang aktif di status rail. */
  readonly stage: number;
  /** Status ini hasil dari langkah mundur — rail menggambar garis balik. */
  readonly reverted?: boolean;
  /** Status akhir; tidak ada transisi keluar. */
  readonly terminal?: boolean;
  /** Penjelasan singkat berbahasa Indonesia untuk tooltip & panel bantuan. */
  readonly hint: string;
}

export const CLAIM_STATUS_META: Record<ClaimStatus, ClaimStatusMeta> = {
  DRAFT: {
    label: "Draft",
    tone: "draft",
    stage: 0,
    hint: "Klaim masih disusun QA dan belum dikirim ke QA Dept. Head.",
  },
  PENDING_QA_HEAD_REVIEW: {
    label: "Pending QA Head review",
    tone: "pending",
    stage: 1,
    hint: "Menunggu QA Dept. Head menyetujui atau meminta revisi.",
  },
  REVISION_REQUESTED: {
    label: "Revision requested",
    tone: "pending",
    stage: 1,
    reverted: true,
    hint: "QA Dept. Head meminta perbaikan. QA memperbaiki lalu mengirim ulang.",
  },
  PUBLISHED: {
    label: "Published",
    tone: "published",
    stage: 2,
    hint: "Klaim sudah disebarkan ke seluruh user portal. QA menentukan follow up atau ignore.",
  },
  IGNORED: {
    label: "Ignored",
    tone: "ignored",
    stage: 2,
    terminal: true,
    hint: "Klaim ditutup tanpa CPAR, disertai alasan dan evidence.",
  },
  CPAR_ISSUED: {
    label: "CPAR issued",
    tone: "published",
    stage: 3,
    hint: "CPAR sudah terbit dan dikirim ke departemen penanggung jawab.",
  },
  CPAR_IN_PROGRESS: {
    label: "CPAR in progress",
    tone: "published",
    stage: 3,
    hint: "Pengisian CPAR sedang berjalan lintas departemen.",
  },
  CPAR_UNDER_VERIFICATION: {
    label: "CPAR under verification",
    tone: "pending",
    stage: 4,
    hint: "Menunggu keputusan seluruh verifier pada siklus berjalan.",
  },
  CPAR_REVISION: {
    label: "CPAR revision",
    tone: "pending",
    stage: 3,
    reverted: true,
    hint: "Ada permintaan revisi. Siklus naik satu dan pengisian CPAR dibuka kembali.",
  },
  CPAR_APPROVED: {
    label: "CPAR approved",
    tone: "published",
    stage: 5,
    hint: "Seluruh verifier menyetujui. Monitoring CAPA siap dimulai.",
  },
  CAPA_MONITORING: {
    label: "CAPA monitoring",
    tone: "monitoring",
    stage: 5,
    hint: "Efektivitas countermeasure sedang dipantau per periode.",
  },
  VERIFIED_CLOSED: {
    label: "Verified closed",
    tone: "closed",
    stage: 6,
    terminal: true,
    hint: "Seluruh periode efektif dan laporan monitoring sudah disetujui.",
  },
};

export function statusMeta(status: ClaimStatus): ClaimStatusMeta {
  return CLAIM_STATUS_META[status];
}
