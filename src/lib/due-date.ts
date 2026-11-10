import { toJakartaParts } from "@/lib/dates";

/**
 * Peringatan tenggat untuk tabel klaim dan CPAR.
 *
 * Satu aturan dipakai kedua dasbor. Kalau masing-masing menghitungnya sendiri, dua
 * tabel yang menampilkan tenggat yang sama pada akhirnya akan menyebutnya berbeda —
 * dan yang satu akan diam-diam berhenti memperingatkan.
 *
 * Seluruh perbandingan memakai **tanggal kalender Jakarta**, bukan titik waktu.
 * `dueDate` disimpan pada akhir jam kerja (17.00 WIB), jadi perbandingan antar-instant
 * akan menyebut pekerjaan yang masih dikerjakan pukul 19.00 pada hari tenggatnya sebagai
 * sudah lewat — padahal harinya belum berganti bagi orang yang mengerjakannya.
 */

/** Sejak berapa hari sebelum tenggat barisnya mulai diperingatkan. */
export const DUE_SOON_DAYS = 2;

export type DueState = "OVERDUE" | "DUE_TODAY" | "DUE_SOON";

export interface DueWarning {
  readonly state: DueState;
  /** Sisa hari; nol berarti hari ini, negatif berarti sudah lewat. */
  readonly daysLeft: number;
  /** Teks pendek untuk chip di dalam baris tabel. */
  readonly label: string;
  readonly tone: "danger" | "pending";
  /** Kalimat utuh untuk tooltip — chip-nya terlalu sempit untuk menjelaskan diri. */
  readonly hint: string;
}

/** Hari kalender Jakarta sebagai angka hari sejak epoch, supaya dapat dikurangkan. */
function jakartaDayIndex(date: Date): number {
  const parts = toJakartaParts(date);

  return Math.floor(Date.UTC(parts.year, parts.month, parts.day) / 86_400_000);
}

/**
 * Peringatan untuk satu tenggat, atau null bila tidak perlu diperingatkan.
 *
 * Null pada tiga keadaan, dan ketiganya disengaja:
 *
 *   · tidak ada tenggatnya — klaim yang CPAR-nya belum terbit memang belum punya;
 *   · pekerjaannya sudah selesai (`settled`). Tenggat yang sudah dipenuhi tidak boleh
 *     terus berteriak merah di daftar; yang menarik setelah itu adalah ketepatan
 *     waktunya, dan itu urusan badge status;
 *   · masih jauh. Baris yang semuanya berwarna sama saja tidak memberi tahu apa pun —
 *     peringatan hanya berarti kalau ia jarang.
 */
export function dueWarning(
  dueDate: Date | null | undefined,
  now: Date,
  settled: boolean,
): DueWarning | null {
  if (!dueDate || settled) return null;

  const daysLeft = jakartaDayIndex(dueDate) - jakartaDayIndex(now);

  if (daysLeft < 0) {
    const late = Math.abs(daysLeft);

    return {
      state: "OVERDUE",
      daysLeft,
      label: late === 1 ? "lewat 1 hari" : `lewat ${late} hari`,
      tone: "danger",
      hint: `Sudah melewati tenggat ${late} hari.`,
    };
  }

  if (daysLeft === 0) {
    return {
      state: "DUE_TODAY",
      daysLeft,
      label: "jatuh tempo hari ini",
      tone: "danger",
      hint: "Tenggatnya hari ini.",
    };
  }

  if (daysLeft <= DUE_SOON_DAYS) {
    return {
      state: "DUE_SOON",
      daysLeft,
      label: `H-${daysLeft}`,
      tone: "pending",
      hint: daysLeft === 1 ? "Tenggatnya besok." : `Tenggatnya ${daysLeft} hari lagi.`,
    };
  }

  return null;
}
