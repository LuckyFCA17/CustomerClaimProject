import { CLAIM_TYPE_LABEL } from "@/lib/analytics";
import { CLAIM_STATUS_META } from "@/config/claim-status";
import type { ClaimQuery } from "@/lib/claim-filters";
import { hasActiveFilter } from "@/lib/claim-filters";

/**
 * Ekspor daftar klaim ke Excel (§6, Fase 7).
 *
 * Yang diekspor adalah apa yang sedang tersaring di layar, bukan seluruh register:
 * orang yang menekan "Export" baru saja menyusun penyaringnya, dan berkas yang
 * mengabaikan penyaring itu memaksanya menyaring ulang di Excel.
 *
 * Kolomnya ditulis di sini — bukan di route-nya — supaya urutan, judul, dan cara satu
 * nilai kosong ditampilkan dapat diuji tanpa membangkitkan berkasnya.
 */

/**
 * Batas baris satu berkas.
 *
 * Bukan batas Excel (sejuta baris), melainkan batas ingatan: seluruh berkas disusun di
 * memori sebelum dikirim. Register pabrik tidak akan menyentuh angka ini dalam waktu
 * dekat, dan kalau sampai menyentuhnya, lebih baik berkasnya terpotong dengan
 * keterangan daripada prosesnya mati tanpa penjelasan.
 */
export const EXPORT_ROW_MAX = 5000;

/**
 * Diambil dari `lib/analytics.ts`, bukan disalin: label yang sama ditulis dua kali akan
 * berbeda begitu salah satunya disunting, dan yang satu muncul di berkas ekspor
 * sedangkan yang lain di grafik — selisihnya baru ketahuan saat keduanya dibandingkan.
 */
export const TYPE_LABEL: Record<string, string> = { ...CLAIM_TYPE_LABEL };

const OCCURRENCE_LABEL: Record<string, string> = {
  FIRST_TIME: "First Time",
  SECOND_TIME: "Second Time",
  THIRD_OR_MORE: "Third or More",
};

const ORIGIN_LABEL: Record<string, string> = {
  INTERNAL: "Internal",
  EXTERNAL: "External",
};

/** Bentuk baris yang dibutuhkan ekspor; sengaja sempit agar query-nya ikut sempit. */
export interface ExportableClaim {
  readonly claimNo: string | null;
  readonly status: keyof typeof CLAIM_STATUS_META;
  readonly type: string | null;
  readonly dateOfOccurrence: Date | null;
  readonly dateOfReceived: Date | null;
  readonly problemOrigin: string | null;
  readonly occurrence: string | null;
  readonly partName: string;
  readonly internalPartNo: string;
  readonly customerPartNo: string;
  readonly lotNo: string;
  readonly kanbanNo: string;
  readonly qualityProblem: string;
  readonly customerName: string | null;
  readonly ncDetail: string | null;
  readonly productCategory: string | null;
  readonly createdByName: string;
  readonly createdAt: Date;
  readonly submittedAt: Date | null;
  readonly publishedAt: Date | null;
  readonly cparNo: string | null;
  readonly responsibleDept: string | null;
  readonly cparCycle: number | null;
  readonly cparDueDate: Date | null;
  readonly cparSubmittedAt: Date | null;
  readonly cparApprovedAt: Date | null;
}

export type CellValue = string | number | Date | null;

export interface ExportColumn {
  readonly header: string;
  readonly width: number;
  readonly value: (claim: ExportableClaim) => CellValue;
}

/**
 * Nilai kosong ditulis sebagai sel kosong, bukan tanda hubung.
 *
 * Tanda hubung terbaca sebagai teks oleh Excel, sehingga kolom tanggal yang sebagian
 * berisi "—" berhenti dapat diurutkan maupun difilter — dan mengurutkan adalah alasan
 * orang membuka berkasnya.
 */
const text = (value: string | null | undefined): CellValue => value?.trim() || null;

export const EXPORT_COLUMNS: readonly ExportColumn[] = [
  { header: "Claim No.", width: 20, value: (c) => text(c.claimNo) },
  { header: "Status", width: 22, value: (c) => CLAIM_STATUS_META[c.status].label },
  { header: "Jenis klaim", width: 16, value: (c) => (c.type ? (TYPE_LABEL[c.type] ?? c.type) : null) },
  { header: "Tanggal kejadian", width: 16, value: (c) => c.dateOfOccurrence },
  { header: "Tanggal diterima", width: 16, value: (c) => c.dateOfReceived },
  {
    header: "Asal masalah",
    width: 14,
    value: (c) => (c.problemOrigin ? (ORIGIN_LABEL[c.problemOrigin] ?? c.problemOrigin) : null),
  },
  {
    header: "Occurrence",
    width: 14,
    value: (c) => (c.occurrence ? (OCCURRENCE_LABEL[c.occurrence] ?? c.occurrence) : null),
  },
  { header: "Customer", width: 34, value: (c) => text(c.customerName) },
  { header: "Part name", width: 26, value: (c) => text(c.partName) },
  { header: "NID part no.", width: 16, value: (c) => text(c.internalPartNo) },
  { header: "Customer part no.", width: 18, value: (c) => text(c.customerPartNo) },
  { header: "Lot no.", width: 14, value: (c) => text(c.lotNo) },
  { header: "Kanban no.", width: 14, value: (c) => text(c.kanbanNo) },
  { header: "Non-conformance detail", width: 24, value: (c) => text(c.ncDetail) },
  { header: "Product category", width: 20, value: (c) => text(c.productCategory) },
  { header: "Quality problem", width: 48, value: (c) => text(c.qualityProblem) },
  { header: "Dibuat oleh", width: 20, value: (c) => text(c.createdByName) },
  { header: "Dibuat", width: 18, value: (c) => c.createdAt },
  { header: "Dikirim", width: 18, value: (c) => c.submittedAt },
  { header: "Terbit", width: 18, value: (c) => c.publishedAt },
  { header: "CPAR No.", width: 20, value: (c) => text(c.cparNo) },
  { header: "Penanggung jawab", width: 20, value: (c) => text(c.responsibleDept) },
  { header: "Siklus CPAR", width: 12, value: (c) => c.cparCycle },
  { header: "Tenggat CPAR", width: 16, value: (c) => c.cparDueDate },
  { header: "CPAR dikirim", width: 18, value: (c) => c.cparSubmittedAt },
  { header: "CPAR disetujui", width: 18, value: (c) => c.cparApprovedAt },
];

/** Baris sebagai array nilai, mengikuti urutan kolom. */
export function toExportRow(claim: ExportableClaim): CellValue[] {
  return EXPORT_COLUMNS.map((column) => column.value(claim));
}

/**
 * Nama berkas yang memberi tahu isinya tanpa dibuka.
 *
 * Berkas ekspor menumpuk di folder Unduhan; "claims.xlsx" yang kelima tidak dapat
 * dibedakan dari yang pertama. Tanggal selalu ikut, dan penanda "tersaring" menjelaskan
 * mengapa jumlah barisnya berbeda dari ekspor sebelumnya.
 */
export function exportFileName(query: ClaimQuery, now: Date): string {
  const day = now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const suffix = hasActiveFilter(query) ? "-tersaring" : "";

  return `NCC-claims-${day}${suffix}.xlsx`;
}

/** Ringkasan penyaring yang sedang berlaku, dicetak di baris pertama berkas. */
export function describeFilter(query: ClaimQuery): string {
  const parts = [
    query.q ? `pencarian "${query.q}"` : null,
    query.status ? `status ${CLAIM_STATUS_META[query.status].label}` : null,
    query.type ? `jenis ${TYPE_LABEL[query.type] ?? query.type}` : null,
    query.customerId ? "customer tertentu" : null,
    query.from || query.to
      ? `tanggal kejadian ${query.from ?? "awal"} sampai ${query.to ?? "sekarang"}`
      : null,
  ].filter(Boolean);

  return parts.length > 0 ? `Penyaring: ${parts.join(", ")}` : "Tanpa penyaring";
}
