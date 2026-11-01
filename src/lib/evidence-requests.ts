import type { ParamValue } from "@/lib/claim-filters";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, type PageSize } from "@/lib/claim-filters";

/**
 * Daftar permintaan evidence — pekerjaan yang masih ditunggu dari sebuah CPAR.
 *
 * Tiga tempat meminta orang melampirkan sesuatu: Initial Document Request, permanent
 * countermeasure, dan standardization & horizontal deployment. Ketiganya dikumpulkan
 * menjadi satu daftar, karena yang ditanyakan orang pada dasbor bukan "section mana"
 * melainkan "apa yang masih harus saya kerjakan".
 *
 * Dua di antaranya tersimpan di kolom Json, yang tidak dapat disaring maupun diurutkan
 * oleh basis data. Karena itu penyaringan di sini dikerjakan di memori — dan daftarnya
 * dibatasi pada CPAR yang memang masih bisa dikerjakan, sehingga jumlah barisnya tidak
 * tumbuh bersama seluruh riwayat pabrik.
 */

export type EvidenceRequestKind = "INITIAL_DOCUMENT" | "ACTION_ITEM";

export interface EvidenceRequestRow {
  /** Penanda baris pada tabel; gabungan klaim dan sasarannya. */
  readonly key: string;
  readonly kind: EvidenceRequestKind;
  readonly claimId: string;
  readonly claimNo: string;
  readonly cparNo: string;
  /** Bagian CPAR yang memintanya — dipakai sebagai keterangan baris. */
  readonly sectionLabel: string;
  readonly title: string;
  readonly picId: string | null;
  readonly picName: string | null;
  readonly dueDate: Date | null;
  readonly fileCount: number;
  /** Apa yang dikirim ke server action saat mengunggah dari baris ini. */
  readonly targetId: string;
  readonly canUpload: boolean;
}

/**
 * Terpenuhi atau belum ditentukan dari ada tidaknya berkas, bukan dari centang.
 * Lewat tenggat adalah keadaan yang belum terpenuhi — bukan keadaan ketiga yang
 * berdiri sendiri — sehingga satu baris tidak pernah terhitung dua kali.
 */
export type Completion = "DONE" | "OVERDUE" | "PENDING";

export function completionOf(row: EvidenceRequestRow, now: Date): Completion {
  if (row.fileCount > 0) return "DONE";
  if (row.dueDate && row.dueDate < now) return "OVERDUE";

  return "PENDING";
}

export const COMPLETION_LABEL: Record<Completion, string> = {
  DONE: "Sudah dilampirkan",
  OVERDUE: "Lewat tenggat",
  PENDING: "Menunggu",
};

export const EVIDENCE_SORTS = {
  "due-asc": "Tenggat terdekat",
  "due-desc": "Tenggat terjauh",
  "status-asc": "Status (lewat tenggat dulu)",
  "cpar-asc": "Nomor CPAR",
} as const;

export type EvidenceSortKey = keyof typeof EVIDENCE_SORTS;

export const EVIDENCE_SORT_KEYS = Object.keys(EVIDENCE_SORTS) as EvidenceSortKey[];

export const DEFAULT_EVIDENCE_SORT: EvidenceSortKey = "due-asc";

export interface EvidenceQuery {
  readonly status: Completion | null;
  readonly from: string | null;
  readonly to: string | null;
  readonly sort: EvidenceSortKey;
  /** Hanya permintaan yang ditujukan kepada pengguna yang sedang masuk. */
  readonly mine: boolean;
  readonly perPage: PageSize;
  readonly page: number;
}

/**
 * Awalan parameter.
 *
 * Dasbor CPAR menampilkan dua tabel yang sama-sama membaca alamat halaman. Tanpa
 * awalan, menyaring tabel yang satu akan diam-diam menyaring tabel yang lain.
 */
export const EVIDENCE_PREFIX = "e_";

function first(value: ParamValue): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function asDate(value: ParamValue): string | null {
  const text = first(value);

  return ISO_DATE.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`)) ? text : null;
}

const COMPLETIONS: readonly string[] = ["DONE", "OVERDUE", "PENDING"];

export function parseEvidenceQuery(params: Record<string, ParamValue>): EvidenceQuery {
  const p = (key: string) => params[`${EVIDENCE_PREFIX}${key}`];

  const status = first(p("status"));
  const sort = first(p("sort"));
  const perPage = Number(first(p("per")));
  const page = Number(first(p("page")));

  let from = asDate(p("from"));
  let to = asDate(p("to"));

  if (from && to && from > to) [from, to] = [to, from];

  return {
    status: COMPLETIONS.includes(status) ? (status as Completion) : null,
    from,
    to,
    sort: sort in EVIDENCE_SORTS ? (sort as EvidenceSortKey) : DEFAULT_EVIDENCE_SORT,
    mine: first(p("mine")) === "1",
    perPage: (PAGE_SIZES as readonly number[]).includes(perPage)
      ? (perPage as PageSize)
      : DEFAULT_PAGE_SIZE,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export function hasActiveEvidenceFilter(query: EvidenceQuery): boolean {
  return Boolean(query.status || query.from || query.to || query.mine);
}

/**
 * Menyaring di memori.
 *
 * Baris tanpa tenggat — tindakan yang tanggal implementasinya belum disepakati — ikut
 * tersaring keluar ketika rentang tanggal dipasang. Itu disengaja: rentang tanggal
 * adalah pertanyaan tentang tenggat, dan baris yang tidak punya tenggat bukan jawaban
 * atas pertanyaan itu.
 */
export function filterEvidenceRows(
  rows: readonly EvidenceRequestRow[],
  query: EvidenceQuery,
  actorId: string,
  now: Date,
): EvidenceRequestRow[] {
  const from = query.from ? new Date(`${query.from}T00:00:00.000Z`) : null;
  const to = query.to ? new Date(`${query.to}T23:59:59.999Z`) : null;

  return rows.filter((row) => {
    if (query.mine && row.picId !== actorId) return false;
    if (query.status && completionOf(row, now) !== query.status) return false;

    if (from || to) {
      if (!row.dueDate) return false;
      if (from && row.dueDate < from) return false;
      if (to && row.dueDate > to) return false;
    }

    return true;
  });
}

/** Urutan status pada pengurutan "lewat tenggat dulu". */
const COMPLETION_RANK: Record<Completion, number> = { OVERDUE: 0, PENDING: 1, DONE: 2 };

/**
 * Mengurutkan salinan, bukan daftar aslinya.
 *
 * Baris tanpa tenggat selalu di akhir pada pengurutan tenggat — baik menaik maupun
 * menurun. Yang dicari orang ketika mengurutkan menurut tenggat adalah baris yang punya
 * tenggat, dan deretan "—" di baris teratas hanya menutupi keduanya.
 */
export function sortEvidenceRows(
  rows: readonly EvidenceRequestRow[],
  sort: EvidenceSortKey,
  now: Date,
): EvidenceRequestRow[] {
  const byDue = (a: EvidenceRequestRow, b: EvidenceRequestRow, direction: number) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;

    return (a.dueDate.getTime() - b.dueDate.getTime()) * direction;
  };

  const sorted = [...rows];

  switch (sort) {
    case "due-asc":
      sorted.sort((a, b) => byDue(a, b, 1) || a.cparNo.localeCompare(b.cparNo));
      break;
    case "due-desc":
      sorted.sort((a, b) => byDue(a, b, -1) || a.cparNo.localeCompare(b.cparNo));
      break;
    case "status-asc":
      sorted.sort(
        (a, b) =>
          COMPLETION_RANK[completionOf(a, now)] - COMPLETION_RANK[completionOf(b, now)] ||
          byDue(a, b, 1),
      );
      break;
    case "cpar-asc":
      sorted.sort((a, b) => a.cparNo.localeCompare(b.cparNo) || byDue(a, b, 1));
      break;
  }

  return sorted;
}

export interface EvidenceTally {
  readonly total: number;
  readonly pending: number;
  readonly overdue: number;
  readonly done: number;
}

export function tallyEvidence(
  rows: readonly EvidenceRequestRow[],
  now: Date,
): EvidenceTally {
  let pending = 0;
  let overdue = 0;
  let done = 0;

  for (const row of rows) {
    const completion = completionOf(row, now);
    if (completion === "DONE") done += 1;
    else if (completion === "OVERDUE") overdue += 1;
    else pending += 1;
  }

  return { total: rows.length, pending, overdue, done };
}

/** Query string tabel evidence; nilai bawaan tidak ikut ditulis. */
export function evidenceParams(
  query: EvidenceQuery,
  overrides: Partial<EvidenceQuery> = {},
): Record<string, string> {
  const merged = { ...query, ...overrides };
  const out: Record<string, string> = {};
  const set = (key: string, value: string) => {
    out[`${EVIDENCE_PREFIX}${key}`] = value;
  };

  if (merged.status) set("status", merged.status);
  if (merged.from) set("from", merged.from);
  if (merged.to) set("to", merged.to);
  if (merged.sort !== DEFAULT_EVIDENCE_SORT) set("sort", merged.sort);
  if (merged.mine) set("mine", "1");
  if (merged.perPage !== DEFAULT_PAGE_SIZE) set("per", String(merged.perPage));
  if (merged.page > 1) set("page", String(merged.page));

  return out;
}
