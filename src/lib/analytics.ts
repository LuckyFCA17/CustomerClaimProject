import type { ClaimType } from "@/generated/prisma/enums";

/**
 * Perhitungan Claim Analytics (§7).
 *
 * Dipisahkan dari halamannya supaya pertanyaan yang dijawabnya — berapa banyak per
 * jenis klaim, dan berapa porsinya — dapat diuji tanpa basis data. Dua grafik lain pada
 * halaman itu memakai `lib/dashboard.ts` yang sudah ada: `monthlySeries` untuk tren
 * bulanan, dan `paretoRows` untuk jenis defek maupun departemen penanggung jawab.
 * Keduanya sengaja tidak disalin ke sini — satu perhitungan, dua tempat memakainya.
 */

/**
 * Urutan tetap, bukan urutan menurut jumlah.
 *
 * Grafik jenis klaim selalu menggambar ketiganya dengan warna yang sama di posisi yang
 * sama, berapa pun angkanya. Mengurutkannya menurut jumlah membuat warna berpindah
 * setiap kali datanya berubah — dan pembaca yang membandingkan dua periode akan mengira
 * jenis klaimnya yang bertukar, bukan peringkatnya.
 */
export const CLAIM_TYPE_ORDER = [
  "OFFICIAL",
  "NON_OFFICIAL",
  "INFORMATION_ONLY",
] as const satisfies readonly ClaimType[];

export const CLAIM_TYPE_LABEL: Record<ClaimType, string> = {
  OFFICIAL: "Official",
  NON_OFFICIAL: "Non-Official",
  INFORMATION_ONLY: "Information Only",
};

/** Penjelasan singkat di bawah tiap batang — apa yang sebenarnya dihitung. */
export const CLAIM_TYPE_HINT: Record<ClaimType, string> = {
  OFFICIAL: "Klaim resmi dari pelanggan, menuntut jawaban tertulis.",
  NON_OFFICIAL: "Disampaikan lisan atau lewat jalur tidak resmi.",
  INFORMATION_ONLY: "Pemberitahuan tanpa tuntutan tindakan perbaikan.",
};

/**
 * Baris untuk klaim yang jenisnya belum diisi.
 *
 * `Claim.type` nullable — draft belum tentu sudah ditentukan jenisnya. Membuang baris
 * itu dari grafik membuat totalnya tidak cocok dengan grafik klaim bulanan di
 * sebelahnya, dan selisih yang tidak dijelaskan membuat seluruh halaman tidak dipercaya.
 *
 * Bukan jenis klaim, jadi tidak diberi warna kategori: ia ketiadaan, dan digambar abu.
 */
export const UNTYPED = "UNTYPED" as const;

export type TypeRowKey = ClaimType | typeof UNTYPED;

export interface TypeRow {
  readonly type: TypeRowKey;
  readonly label: string;
  readonly count: number;
  /** Porsi terhadap total, 0–1. Nol ketika belum ada klaim sama sekali. */
  readonly share: number;
}

/**
 * Jumlah per jenis klaim, lengkap dengan jenis yang nol.
 *
 * Jenis yang tidak punya klaim tetap digambar sebagai batang kosong. Menghilangkannya
 * membuat grafik dua batang terbaca seolah portal hanya mengenal dua jenis klaim —
 * padahal yang ketiga memang nol pada periode itu, dan itu sendiri sebuah temuan.
 */
export function typeBreakdown(
  counts: Partial<Record<ClaimType, number>>,
  untyped = 0,
): readonly TypeRow[] {
  const total =
    CLAIM_TYPE_ORDER.reduce((sum, type) => sum + (counts[type] ?? 0), 0) + Math.max(0, untyped);

  const share = (count: number) => (total === 0 ? 0 : count / total);

  const rows: TypeRow[] = CLAIM_TYPE_ORDER.map((type) => {
    const count = counts[type] ?? 0;

    return { type, label: CLAIM_TYPE_LABEL[type], count, share: share(count) };
  });

  // Hanya muncul bila memang ada. Baris "belum diisi" bernilai nol pada portal yang
  // rapi datanya hanya akan menambah baris yang tidak pernah berubah.
  if (untyped > 0) {
    rows.push({ type: UNTYPED, label: "Belum diisi", count: untyped, share: share(untyped) });
  }

  return rows;
}

export function totalOf(rows: readonly TypeRow[]): number {
  return rows.reduce((sum, row) => sum + row.count, 0);
}
