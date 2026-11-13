import type { ClaimType, OccurrenceCount } from "@/generated/prisma/enums";
import { workingDaysBetween } from "@/lib/dates";

/**
 * Perhitungan Claim Analytics (§7).
 *
 * Dipisahkan dari halamannya supaya pertanyaan yang dijawabnya dapat diuji tanpa basis
 * data. Dua grafik pada halaman itu memakai `lib/dashboard.ts` yang sudah ada —
 * `monthlySeries` untuk tren bulanan dan `paretoRows` untuk peringkat — dan sengaja
 * tidak disalin ke sini: satu perhitungan, beberapa tempat memakainya.
 */

// ─────────────────────── Rincian bernilai tetap ───────────────────────

/**
 * Satu baris pada grafik rincian: jenis klaim, pengulangan, atau apa pun yang berupa
 * daftar nilai tetap dengan jumlahnya masing-masing.
 *
 * Warnanya ikut di baris, bukan dicari komponen lewat kuncinya. Dengan begitu satu
 * komponen dapat menggambar rincian apa pun tanpa mengenal jenis datanya, dan pilihan
 * warnanya tetap berada di dekat keterangan yang menjelaskannya.
 */
export interface BreakdownRow {
  readonly key: string;
  readonly label: string;
  readonly hint: string;
  readonly color: string;
  readonly count: number;
  /** Porsi terhadap total, 0–1. Nol ketika belum ada apa pun. */
  readonly share: number;
}

/** Kunci untuk nilai yang belum diisi. Bukan kategori — ia ketiadaan, dan digambar abu. */
export const UNKNOWN_KEY = "UNKNOWN";

const UNKNOWN_COLOR = "var(--nid-muted)";

interface BreakdownSpec<K extends string> {
  readonly order: readonly K[];
  readonly label: Record<K, string>;
  readonly hint: Record<K, string>;
  readonly color: Record<K, string>;
  /** Kata untuk baris yang nilainya belum diisi, mis. "Belum diisi". */
  readonly unknownLabel: string;
  readonly unknownHint: string;
}

/**
 * Menyusun baris rincian dalam urutan tetap, bukan urutan menurut jumlah.
 *
 * Grafiknya selalu menggambar nilai yang sama dengan warna yang sama di posisi yang
 * sama, berapa pun angkanya. Mengurutkannya menurut jumlah membuat warna berpindah
 * setiap kali datanya berubah — dan pembaca yang membandingkan dua periode akan mengira
 * nilainya yang bertukar, bukan peringkatnya.
 *
 * Nilai yang nol tetap digambar sebagai batang kosong: menghilangkannya membuat grafik
 * dua batang terbaca seolah portal hanya mengenal dua nilai, padahal yang ketiga memang
 * nol pada periode itu — dan itu sendiri sebuah temuan.
 */
function buildBreakdown<K extends string>(
  spec: BreakdownSpec<K>,
  counts: Partial<Record<K, number>>,
  unknown = 0,
): readonly BreakdownRow[] {
  const missing = Math.max(0, unknown);
  const total = spec.order.reduce((sum, key) => sum + (counts[key] ?? 0), 0) + missing;
  const share = (count: number) => (total === 0 ? 0 : count / total);

  const rows: BreakdownRow[] = spec.order.map((key) => ({
    key,
    label: spec.label[key],
    hint: spec.hint[key],
    color: spec.color[key],
    count: counts[key] ?? 0,
    share: share(counts[key] ?? 0),
  }));

  // Baris "belum diisi" hanya muncul bila memang ada. Pada portal yang rapi datanya, ia
  // hanya akan menambah baris bernilai nol yang tidak pernah berubah.
  if (missing > 0) {
    rows.push({
      key: UNKNOWN_KEY,
      label: spec.unknownLabel,
      hint: spec.unknownHint,
      color: UNKNOWN_COLOR,
      count: missing,
      share: share(missing),
    });
  }

  return rows;
}

export function totalOf(rows: readonly BreakdownRow[]): number {
  return rows.reduce((sum, row) => sum + row.count, 0);
}

// ─────────────────────── Jenis klaim ───────────────────────

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

/**
 * Tiga warna kategori, divalidasi untuk **seluruh pasangan** sekaligus — bukan hanya
 * pasangan bersebelahan. Pilihan pertama (biru–jingga–ungu) gagal: ungu dan biru nyaris
 * tidak terbedakan pada deuteranopia. Biru–magenta pada susunan ini masih berdekatan di
 * protanopia, dan itu sebabnya tiap batang tetap diberi label namanya sendiri —
 * identitas tidak pernah bergantung pada warna saja.
 */
const CLAIM_TYPE_COLOR: Record<ClaimType, string> = {
  OFFICIAL: "#1d4ed8",
  NON_OFFICIAL: "#d97428",
  INFORMATION_ONLY: "#a21caf",
};

const CLAIM_TYPE_HINT: Record<ClaimType, string> = {
  OFFICIAL: "Klaim resmi dari pelanggan, menuntut jawaban tertulis.",
  NON_OFFICIAL: "Disampaikan lisan atau lewat jalur tidak resmi.",
  INFORMATION_ONLY: "Pemberitahuan tanpa tuntutan tindakan perbaikan.",
};

export function typeBreakdown(
  counts: Partial<Record<ClaimType, number>>,
  untyped = 0,
): readonly BreakdownRow[] {
  return buildBreakdown(
    {
      order: CLAIM_TYPE_ORDER,
      label: CLAIM_TYPE_LABEL,
      hint: CLAIM_TYPE_HINT,
      color: CLAIM_TYPE_COLOR,
      unknownLabel: "Belum diisi",
      unknownHint: "Draft yang jenis klaimnya belum ditentukan.",
    },
    counts,
    untyped,
  );
}

// ─────────────────────── Pengulangan kejadian ───────────────────────

export const OCCURRENCE_ORDER = [
  "FIRST_TIME",
  "SECOND_TIME",
  "THIRD_OR_MORE",
] as const satisfies readonly OccurrenceCount[];

export const OCCURRENCE_LABEL: Record<OccurrenceCount, string> = {
  FIRST_TIME: "Pertama kali",
  SECOND_TIME: "Kedua kali",
  THIRD_OR_MORE: "Ketiga kali atau lebih",
};

/**
 * Satu rona, makin gelap makin sering berulang.
 *
 * Bukan warna kategori: pengulangan punya urutan — pertama, kedua, ketiga — dan warna
 * berurut menyampaikan urutan itu tanpa perlu dibaca. Warna kategori yang berbeda rona
 * justru menyembunyikannya, karena biru dan jingga tidak punya "lebih besar".
 *
 * Warna status (hijau/kuning/merah) sengaja tidak dipakai: ia disediakan untuk keadaan
 * yang menuntut tindakan segera, dan memakainya di sini akan membuat seluruh dasbor
 * kehilangan arti merahnya.
 */
const OCCURRENCE_COLOR: Record<OccurrenceCount, string> = {
  FIRST_TIME: "#f6c89a",
  SECOND_TIME: "#e8873a",
  THIRD_OR_MORE: "#8a4310",
};

const OCCURRENCE_HINT: Record<OccurrenceCount, string> = {
  FIRST_TIME: "Baru pertama kali terjadi pada part ini.",
  SECOND_TIME: "Pernah terjadi sebelumnya — countermeasure terdahulu belum menahan.",
  THIRD_OR_MORE: "Berulang tiga kali atau lebih. Akar masalahnya belum tersentuh.",
};

export function occurrenceBreakdown(
  counts: Partial<Record<OccurrenceCount, number>>,
  unknown = 0,
): readonly BreakdownRow[] {
  return buildBreakdown(
    {
      order: OCCURRENCE_ORDER,
      label: OCCURRENCE_LABEL,
      hint: OCCURRENCE_HINT,
      color: OCCURRENCE_COLOR,
      unknownLabel: "Belum diisi",
      unknownHint: "Klaim yang jumlah kejadiannya belum ditentukan.",
    },
    counts,
    unknown,
  );
}

/** Klaim yang pernah terjadi sebelumnya — yang menjadi perhatian, bukan yang pertama. */
export function repeatShare(rows: readonly BreakdownRow[]): number {
  const total = totalOf(rows);
  if (total === 0) return 0;

  const repeats = rows
    .filter((row) => row.key === "SECOND_TIME" || row.key === "THIRD_OR_MORE")
    .reduce((sum, row) => sum + row.count, 0);

  return repeats / total;
}

// ─────────────────────── Lead time per tahap ───────────────────────

/**
 * Median, bukan rata-rata.
 *
 * Satu klaim yang menggantung enam bulan menarik rata-rata sampai angkanya tidak lagi
 * menggambarkan klaim mana pun. Median tetap menyebut berapa lama klaim yang biasa.
 */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? (sorted[middle] ?? null)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/**
 * Lama satu tahap dalam **hari kerja**, atau null bila ujungnya belum ada.
 *
 * Hari kerja, bukan hari kalender, karena seluruh tenggat portal juga hari kerja: CPAR
 * jatuh tempo H+3 hari kerja, periode pemantauan berjarak sekian hari kerja. Lead time
 * dalam hari kalender tidak dapat dibandingkan dengan tenggatnya sendiri — median 7 hari
 * kalender di sebelah target 3 hari kerja terbaca seperti keterlambatan padahal mungkin
 * tepat waktu.
 *
 * Akibatnya angkanya bulat dan mengecil: klaim yang diterima Jumat dan terbit Senin
 * berjarak 1 hari kerja, bukan 3. Keduanya benar — yang berbeda pertanyaannya, dan yang
 * dijawab halaman ini berapa kapasitas kerja yang terpakai.
 */
export function stageDays(
  from: Date | null | undefined,
  to: Date | null | undefined,
): number | null {
  if (!from || !to) return null;

  // Urutan terbalik berarti datanya tidak masuk akal — mis. tanggal diterima disunting
  // menjadi sesudah tanggal terbit. Dibiarkan masuk, ia menjadi 0 dan menarik median ke
  // bawah secara diam-diam; dibuang, ia hanya mengurangi sampel yang memang disebutkan.
  if (to.getTime() < from.getTime()) return null;

  return workingDaysBetween(from, to);
}

export const LEAD_TIME_STAGES = [
  "RESPONSE",
  "FILLING",
  "VERIFICATION",
  "MONITORING",
] as const;

export type LeadTimeStage = (typeof LEAD_TIME_STAGES)[number];

export const LEAD_TIME_LABEL: Record<LeadTimeStage, string> = {
  RESPONSE: "Respons QA",
  FILLING: "Pengisian departemen",
  VERIFICATION: "Rantai verifikasi",
  MONITORING: "Pemantauan CAPA",
};

export const LEAD_TIME_HINT: Record<LeadTimeStage, string> = {
  RESPONSE: "Klaim diterima sampai terbit.",
  FILLING: "CPAR diterbitkan sampai dikirim ke verifikasi.",
  VERIFICATION: "CPAR dikirim sampai disetujui keempat kapasitas.",
  MONITORING: "CPAR disetujui sampai klaim ditutup.",
};

/** Satu klaim, hanya tanggal yang dibutuhkan perhitungan lead time. */
export interface LeadTimeInput {
  readonly receivedAt: Date | null;
  readonly publishedAt: Date | null;
  readonly cparIssuedAt: Date | null;
  readonly cparSubmittedAt: Date | null;
  readonly cparApprovedAt: Date | null;
  readonly closedAt: Date | null;
}

export interface LeadTimeRow {
  readonly stage: LeadTimeStage;
  readonly label: string;
  readonly hint: string;
  /** Hari kerja. Null bila belum ada satu pun klaim yang melewati tahap ini. */
  readonly medianDays: number | null;
  readonly slowestDays: number | null;
  /** Berapa klaim yang benar-benar terhitung pada tahap ini. */
  readonly sample: number;
}

export interface LeadTimeSummary {
  readonly stages: readonly LeadTimeRow[];
  /** Diterima sampai ditutup, untuk klaim yang sudah selesai sepenuhnya. */
  readonly totalMedianDays: number | null;
  readonly totalSample: number;
}

const STAGE_ENDS: Record<LeadTimeStage, (claim: LeadTimeInput) => [Date | null, Date | null]> = {
  RESPONSE: (claim) => [claim.receivedAt, claim.publishedAt],
  FILLING: (claim) => [claim.cparIssuedAt, claim.cparSubmittedAt],
  VERIFICATION: (claim) => [claim.cparSubmittedAt, claim.cparApprovedAt],
  MONITORING: (claim) => [claim.cparApprovedAt, claim.closedAt],
};

/**
 * Berapa lama tiap tahap berlangsung, dalam hari kerja Senin–Jumat.
 *
 * Tiap tahap punya jumlah sampelnya sendiri, dan jumlah itu **wajib ikut ditampilkan**:
 * klaim yang belum disetujui belum punya lama verifikasi, sehingga median satu tahap
 * bisa berasal dari tiga klaim sementara tahap di sebelahnya dari empat puluh. Median
 * yang disandingkan tanpa menyebut sampelnya mengundang perbandingan yang tidak sah.
 */
export function leadTimeSummary(claims: readonly LeadTimeInput[]): LeadTimeSummary {
  const stages = LEAD_TIME_STAGES.map((stage): LeadTimeRow => {
    const durations = claims
      .map((claim) => {
        const [from, to] = STAGE_ENDS[stage](claim);

        return stageDays(from, to);
      })
      .filter((value): value is number => value !== null);

    return {
      stage,
      label: LEAD_TIME_LABEL[stage],
      hint: LEAD_TIME_HINT[stage],
      medianDays: median(durations),
      slowestDays: durations.length > 0 ? Math.max(...durations) : null,
      sample: durations.length,
    };
  });

  const totals = claims
    .map((claim) => stageDays(claim.receivedAt, claim.closedAt))
    .filter((value): value is number => value !== null);

  return {
    stages,
    totalMedianDays: median(totals),
    totalSample: totals.length,
  };
}

/**
 * `4` → `4 hari`, `2.5` → `2,5 hari`.
 *
 * Hari kerja selalu bulat, tetapi mediannya bisa pecahan saat sampelnya genap — dan
 * setengah hari itu tidak dibulatkan: pada tahap yang biasanya hanya dua hari, selisih
 * setengah hari adalah seperempat dari keseluruhannya.
 */
export function formatDays(days: number | null): string {
  if (days === null) return "—";

  const rounded = Math.round(days * 10) / 10;

  return `${rounded.toLocaleString("id-ID")} hari`;
}
