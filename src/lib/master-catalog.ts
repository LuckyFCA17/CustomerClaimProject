/**
 * Enam daftar acuan yang bentuknya hampir sama (§6 master data).
 *
 * Customer, part, non-conformance detail, product category, initial document, dan grup
 * penerima email semuanya "kode + nama + aktif". Memberi masing-masing halaman dan
 * server action sendiri akan menghasilkan enam salinan kode yang lambat laun berbeda
 * tanpa alasan — jadi yang berbeda dijadikan data, dan yang sama dijadikan satu jalur.
 *
 * Yang benar-benar berbeda hanya tiga: urutan tampil (tiga daftar memakainya), satu
 * kolom tambahan pada part, dan penerima pada grup email.
 */

export const CATALOG_SLUGS = [
  "customers",
  "parts",
  "nc-details",
  "product-categories",
  "documents",
  "recipient-groups",
] as const;

export type CatalogSlug = (typeof CATALOG_SLUGS)[number];

export interface CatalogDefinition {
  readonly slug: CatalogSlug;
  readonly title: string;
  readonly description: string;
  /** Penjelasan singkat untuk kartu pintu masuk di /master. */
  readonly summary: string;
  readonly codeLabel: string;
  readonly codePlaceholder: string;
  readonly nameLabel: string;
  readonly namePlaceholder: string;
  /** Daftar yang urutan tampilnya ditentukan manusia, bukan abjad. */
  readonly hasSortOrder: boolean;
  /** Kolom tambahan khusus part. */
  readonly extraField: { readonly label: string; readonly placeholder: string } | null;
  /** Grup penerima email memilih role dan alamat tambahan. */
  readonly hasRecipients: boolean;
  /** Apa yang hilang ketika barisnya dinonaktifkan. */
  readonly inactiveHint: string;
}

export const CATALOGS: Record<CatalogSlug, CatalogDefinition> = {
  customers: {
    slug: "customers",
    title: "Customer",
    description: "Pelanggan yang mengajukan klaim.",
    summary: "Pelanggan yang mengajukan klaim",
    codeLabel: "Kode",
    codePlaceholder: "TMMIN",
    nameLabel: "Nama customer",
    namePlaceholder: "PT Toyota Motor Manufacturing Indonesia",
    hasSortOrder: false,
    extraField: null,
    hasRecipients: false,
    inactiveHint: "Hilang dari pilihan customer pada klaim baru.",
  },
  parts: {
    slug: "parts",
    title: "Part",
    description: "Part NID beserta nomor part pelanggannya.",
    summary: "Nomor part NID dan pelanggan",
    codeLabel: "NID part no.",
    codePlaceholder: "NID-4451-02",
    nameLabel: "Nama part",
    namePlaceholder: "Clip Fastener Bumper",
    hasSortOrder: false,
    extraField: { label: "Customer part no. (opsional)", placeholder: "90467-09201" },
    hasRecipients: false,
    inactiveHint: "Hilang dari saran pengisian part pada klaim baru.",
  },
  "nc-details": {
    slug: "nc-details",
    title: "Non-conformance detail",
    description: "Jenis cacat yang dipilih saat menerbitkan klaim.",
    summary: "Jenis cacat pada klaim",
    codeLabel: "Kode",
    codePlaceholder: "CRACK_BROKEN",
    nameLabel: "Nama",
    namePlaceholder: "Crack / Broken",
    hasSortOrder: true,
    extraField: null,
    hasRecipients: false,
    inactiveHint: "Hilang dari pilihan pada klaim baru; klaim lama tetap menampilkannya.",
  },
  "product-categories": {
    slug: "product-categories",
    title: "Product category",
    description: "Pengelompokan part pada klaim.",
    summary: "Pengelompokan part",
    codeLabel: "Kode",
    codePlaceholder: "CRITICAL_PART",
    nameLabel: "Nama",
    namePlaceholder: "Critical Part",
    hasSortOrder: true,
    extraField: null,
    hasRecipients: false,
    inactiveHint: "Hilang dari pilihan pada klaim baru; klaim lama tetap menampilkannya.",
  },
  documents: {
    slug: "documents",
    title: "Initial document",
    description: "Dokumen yang dapat diminta bersama CPAR.",
    summary: "Dokumen yang diminta bersama CPAR",
    codeLabel: "Kode",
    codePlaceholder: "4M_CHANGE_SHEET",
    nameLabel: "Nama dokumen",
    namePlaceholder: "4M Change Sheet",
    hasSortOrder: true,
    extraField: null,
    hasRecipients: false,
    inactiveHint: "Hilang dari pilihan saat menerbitkan CPAR; permintaan lama tetap berlaku.",
  },
  "recipient-groups": {
    slug: "recipient-groups",
    title: "Grup penerima email",
    description:
      "Siapa yang menerima notifikasi siaran — klaim terbit, klaim diabaikan, CPAR disetujui.",
    summary: "Penerima notifikasi siaran",
    codeLabel: "Kode",
    codePlaceholder: "ALL_PORTAL_USERS",
    nameLabel: "Nama grup",
    namePlaceholder: "Seluruh user portal",
    hasSortOrder: false,
    extraField: null,
    hasRecipients: true,
    inactiveHint: "Notifikasi yang memakai grup ini berhenti menemukan penerima.",
  },
};

export function isCatalogSlug(value: string): value is CatalogSlug {
  return (CATALOG_SLUGS as readonly string[]).includes(value);
}

export const CATALOG_LIST: readonly CatalogDefinition[] = CATALOG_SLUGS.map(
  (slug) => CATALOGS[slug],
);
