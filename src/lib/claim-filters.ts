import type { ClaimStatus, ClaimType, Prisma } from "@/generated/prisma/client";
import { ClaimStatus as Status, ClaimType as Type } from "@/generated/prisma/enums";

/**
 * Penyaringan dan pengurutan daftar klaim.
 *
 * Seluruhnya dibaca dari query string, bukan disimpan di state komponen: tautan ke
 * daftar yang sudah disaring dapat dibagikan ke rekan, dibuka ulang dari riwayat
 * peramban, dan dipakai kembali oleh ekspor Excel nanti. State di komponen tidak
 * dapat melakukan satu pun dari ketiganya.
 *
 * Nilai yang tidak dikenal tidak pernah menjatuhkan halaman — query string datang dari
 * tautan yang bisa salah ketik atau basi, dan daftar klaim yang menolak terbuka jauh
 * lebih merepotkan daripada filter yang diam-diam kembali ke bawaannya.
 */

export const PAGE_SIZES = [10, 25, 50] as const;

export type PageSize = (typeof PAGE_SIZES)[number];

export const DEFAULT_PAGE_SIZE: PageSize = 25;

export interface ClaimSort {
  readonly label: string;
  readonly orderBy: Prisma.ClaimOrderByWithRelationInput[];
}

/**
 * Pilihan urutan.
 *
 * Klaim tanpa tanggal kejadian — draft yang belum diisi — selalu ditaruh di akhir,
 * bukan di awal: yang dicari orang saat mengurutkan menurut tanggal adalah klaim yang
 * punya tanggal, dan deretan "—" di baris teratas hanya menutupi keduanya.
 */
export const CLAIM_SORTS = {
  "date-desc": {
    label: "Tanggal terbaru",
    orderBy: [{ dateOfOccurrence: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  },
  "date-asc": {
    label: "Tanggal terlama",
    orderBy: [{ dateOfOccurrence: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  },
  "claim-desc": {
    label: "Nomor klaim terbesar",
    orderBy: [{ claimNo: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  },
  "claim-asc": {
    label: "Nomor klaim terkecil",
    orderBy: [{ claimNo: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  },
  "part-asc": {
    label: "Nama part A–Z",
    orderBy: [{ partName: "asc" }, { internalPartNo: "asc" }],
  },
  "customer-asc": {
    label: "Customer A–Z",
    orderBy: [{ customer: { name: "asc" } }, { createdAt: "desc" }],
  },
  // Enum status dideklarasikan menurut urutan alurnya, dan PostgreSQL mengurutkan enum
  // menurut urutan deklarasi — jadi ini benar-benar "dari draft sampai closed".
  "status-asc": {
    label: "Status (urutan alur)",
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  },
} as const satisfies Record<string, ClaimSort>;

export type ClaimSortKey = keyof typeof CLAIM_SORTS;

export const DEFAULT_SORT: ClaimSortKey = "date-desc";

export const SORT_KEYS = Object.keys(CLAIM_SORTS) as ClaimSortKey[];

export interface ClaimQuery {
  readonly q: string;
  readonly status: ClaimStatus | null;
  readonly type: ClaimType | null;
  readonly customerId: string | null;
  /** Batas bawah dan atas tanggal kejadian, sebagai tanggal kalender YYYY-MM-DD. */
  readonly from: string | null;
  readonly to: string | null;
  readonly sort: ClaimSortKey;
  readonly perPage: PageSize;
  readonly page: number;
}

/** Satu nilai dari `searchParams`; Next memberi array bila kuncinya muncul dua kali. */
export type ParamValue = string | string[] | undefined;

function first(value: ParamValue): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function asDate(value: ParamValue): string | null {
  const text = first(value);

  return ISO_DATE.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`)) ? text : null;
}

export const SEARCH_MAX = 120;

export function parseClaimQuery(params: Record<string, ParamValue>): ClaimQuery {
  const status = first(params.status);
  const type = first(params.type);
  const sort = first(params.sort);
  const perPage = Number(first(params.per));
  const page = Number(first(params.page));

  let from = asDate(params.from);
  let to = asDate(params.to);

  // Rentang terbalik dibetulkan, bukan ditolak: orang yang mengisi tanggalnya terbalik
  // bermaksud menyaring rentang itu juga, dan daftar kosong tidak memberitahunya apa pun.
  if (from && to && from > to) [from, to] = [to, from];

  return {
    q: first(params.q).slice(0, SEARCH_MAX),
    status: status in Status ? (status as ClaimStatus) : null,
    type: type in Type ? (type as ClaimType) : null,
    customerId: first(params.customer) || null,
    from,
    to,
    sort: sort in CLAIM_SORTS ? (sort as ClaimSortKey) : DEFAULT_SORT,
    perPage: (PAGE_SIZES as readonly number[]).includes(perPage)
      ? (perPage as PageSize)
      : DEFAULT_PAGE_SIZE,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/** Benar bila ada satu saja penyaring aktif; dipakai untuk menawarkan "Reset". */
export function hasActiveFilter(query: ClaimQuery): boolean {
  return Boolean(query.q || query.status || query.type || query.customerId || query.from || query.to);
}

/**
 * Bagian `where` dari penyaring — tanpa aturan visibilitas.
 *
 * Sengaja dipisah dari `visibleClaimsWhere`: yang satu menentukan apa yang boleh dilihat
 * seseorang, yang lain apa yang sedang ia cari. Menggabungkannya menjadi satu fungsi
 * membuat kedua aturan itu mudah tertukar, dan yang pertama adalah aturan keamanan.
 */
export function claimFilterWhere(query: ClaimQuery): Prisma.ClaimWhereInput {
  const and: Prisma.ClaimWhereInput[] = [];

  if (query.q) {
    const contains = { contains: query.q, mode: "insensitive" } as const;

    and.push({
      OR: [
        { claimNo: contains },
        { partName: contains },
        { internalPartNo: contains },
        { customerPartNo: contains },
        { lotNo: contains },
        { qualityProblem: contains },
        { customer: { name: contains } },
        { cpar: { cparNo: contains } },
      ],
    });
  }

  if (query.status) and.push({ status: query.status });
  if (query.type) and.push({ type: query.type });
  if (query.customerId) and.push({ customerId: query.customerId });

  if (query.from || query.to) {
    and.push({
      dateOfOccurrence: {
        ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
        ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
      },
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

export function claimOrderBy(sort: ClaimSortKey): Prisma.ClaimOrderByWithRelationInput[] {
  return [...CLAIM_SORTS[sort].orderBy];
}

/**
 * Query string untuk tautan halaman berikutnya dan sejenisnya.
 *
 * Nilai bawaan tidak ikut ditulis, sehingga alamat daftar yang belum disaring tetap
 * bersih dan dua tautan ke tampilan yang sama tidak pernah berbeda tulisannya.
 */
export function claimQueryString(query: ClaimQuery, overrides: Partial<ClaimQuery> = {}): string {
  const merged = { ...query, ...overrides };
  const params = new URLSearchParams();

  if (merged.q) params.set("q", merged.q);
  if (merged.status) params.set("status", merged.status);
  if (merged.type) params.set("type", merged.type);
  if (merged.customerId) params.set("customer", merged.customerId);
  if (merged.from) params.set("from", merged.from);
  if (merged.to) params.set("to", merged.to);
  if (merged.sort !== DEFAULT_SORT) params.set("sort", merged.sort);
  if (merged.perPage !== DEFAULT_PAGE_SIZE) params.set("per", String(merged.perPage));
  if (merged.page > 1) params.set("page", String(merged.page));

  const text = params.toString();

  return text ? `?${text}` : "";
}

export interface PageRange {
  readonly total: number;
  readonly pageCount: number;
  /** Halaman yang benar-benar ditampilkan setelah dijepit ke rentang yang ada. */
  readonly page: number;
  readonly skip: number;
  /** Nomor urut baris pertama dan terakhir, 1-basis; keduanya 0 bila tidak ada hasil. */
  readonly firstRow: number;
  readonly lastRow: number;
}

/**
 * Menjepit nomor halaman ke jumlah hasil yang ada.
 *
 * Penyaring yang dipersempit saat pengguna berada di halaman 7 akan menyisakan nomor
 * halaman yang sudah tidak ada. Menampilkan halaman kosong di situ terbaca seperti
 * "tidak ada hasil", padahal hasilnya ada di halaman pertama.
 */
export function pageRange(total: number, query: ClaimQuery): PageRange {
  const pageCount = Math.max(1, Math.ceil(total / query.perPage));
  const page = Math.min(Math.max(1, query.page), pageCount);
  const skip = (page - 1) * query.perPage;

  return {
    total,
    pageCount,
    page,
    skip,
    firstRow: total === 0 ? 0 : skip + 1,
    lastRow: Math.min(skip + query.perPage, total),
  };
}
