import type { NotificationType } from "@/generated/prisma/enums";

/**
 * Isi email yang dibekukan saat notifikasi dimasukkan antrean.
 *
 * Disimpan di kolom `Notification.payload`, bukan dibaca ulang dari klaim saat kirim.
 * Alasannya: pengiriman terjadi setelah transaksi commit dan bisa tertunda atau diulang,
 * sementara klaimnya mungkin sudah berpindah status. Email harus menggambarkan keadaan
 * saat peristiwanya terjadi, bukan keadaan saat kurirnya sempat jalan.
 */
export interface ClaimEmailPayload {
  readonly claimId: string;
  readonly claimNo: string;
  readonly claimType: string;
  readonly statusLabel: string;
  readonly partName: string;
  readonly internalPartNo: string;
  readonly customerPartNo: string;
  readonly customerName: string | null;
  readonly ncDetail: string | null;
  readonly productCategory: string | null;
  readonly dateOfOccurrence: string | null;
  readonly dateOfReceived: string | null;
  readonly qualityProblem: string;
  readonly actorName: string;
  readonly actorJobTitle: string;
  readonly comment?: string | null;
  readonly portalUrl: string;
  readonly attachmentNames?: readonly string[];

  /** Terisi pada notifikasi yang menyangkut CPAR (§8 #4). */
  readonly cparNo?: string | null;
  readonly responsibleDept?: string | null;
  readonly cftMembers?: readonly string[];
  readonly initialDocuments?: readonly string[];
  readonly dueDate?: string | null;

  /** Terisi pada notifikasi rantai verifikasi (§8 #7, #9, #10). */
  readonly cycle?: number | null;
  /** Tautan ke halaman CPAR; `portalUrl` menunjuk ke halaman klaim. */
  readonly cparUrl?: string | null;
  /** Kapasitas verifier wajib, dibekukan saat siklus dibuka (PLAN §2.4). */
  readonly verifierCapacities?: readonly string[];
  /** Section yang ditandai bermasalah oleh verifier. */
  readonly targetSections?: readonly string[];

  /** Terisi pada notifikasi pemantauan CAPA (§8 #11, #13, #14). */
  readonly periods?: readonly string[];
  readonly periodNo?: number | null;
}

export interface RenderedEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export const NOTIFICATION_LABEL: Record<NotificationType, string> = {
  CLAIM_REVIEW_REQUEST: "Claim Review Request",
  CLAIM_REVISION_REQUEST: "Claim Revision Request",
  NEW_CUSTOMER_CLAIM: "New Customer Claim Notification",
  CPAR_REQUEST: "CPAR Request / Job Request",
  CLAIM_IGNORATION: "Claim Ignoration Notification",
  CPAR_DAILY_REMINDER: "Follow Up Daily Reminder",
  CPAR_REVIEW_REQUEST: "CPAR Review Request",
  CPAR_REVIEW_REMINDER: "CPAR Review Reminder",
  CPAR_REVISION_REQUEST: "CPAR Revision Request",
  CPAR_APPROVED: "CPAR Approved & Monitoring Started",
  MONITORING_EVIDENCE_REQUEST: "Monitoring Evidence Request",
  MONITORING_WEEKLY_REMINDER: "Weekly Monitoring Reminder",
  CAPA_NOT_EFFECTIVE: "CAPA Not Effective — Revision Required",
  MONITORING_FINISHED: "Monitoring Finished / Claim Verified Closed",
};
