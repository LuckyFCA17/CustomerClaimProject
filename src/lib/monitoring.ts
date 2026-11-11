import type {
  MonitoringJudgement,
  MonitoringResultKind,
  MonitoringStatus,
} from "@/generated/prisma/enums";
import { addWorkingDays, endOfWorkingDay, toJakartaDateInput } from "@/lib/dates";

/**
 * Aturan pemantauan efektivitas CAPA (§6 Modul 4).
 *
 * Dipisahkan dari server action supaya tiga pertanyaan yang menentukan modul ini —
 * kapan tiap periode jatuh tempo, apakah klaim boleh ditutup, dan apakah ada periode
 * yang gagal — dapat diuji tanpa basis data.
 */

export const MONITORING_STATUS_LABEL: Record<MonitoringStatus, string> = {
  PENDING: "Menunggu penilaian",
  EFFECTIVE: "Effective",
  NOT_EFFECTIVE: "Not Effective",
};

/** Batas yang dipakai skema dan UI; dikumpulkan di sini agar keduanya tidak berbeda. */
export const PERIOD_COUNT_MIN = 1;
export const PERIOD_COUNT_MAX = 12;
export const PERIOD_INTERVAL_MIN = 1;
export const PERIOD_INTERVAL_MAX = 90;

export interface PlannedPeriod {
  readonly periodNo: number;
  readonly dueDate: Date;
}

/**
 * Jadwal periode pemantauan.
 *
 * Tenggat dihitung dengan hari kerja, bukan hari kalender: periode yang jatuh pada
 * Minggu akan lewat tenggat sebelum ada orang di pabrik yang dapat menilainya.
 * Semuanya dinormalkan ke akhir jam kerja supaya periode tidak terbaca kedaluwarsa
 * sejak pukul tujuh pagi pada hari H.
 */
export function planPeriods(count: number, intervalDays: number, from: Date): PlannedPeriod[] {
  const periods: PlannedPeriod[] = [];

  for (let index = 1; index <= count; index += 1) {
    periods.push({
      periodNo: index,
      dueDate: endOfWorkingDay(addWorkingDays(from, intervalDays * index)),
    });
  }

  return periods;
}

export interface PeriodState {
  readonly periodNo: number;
  readonly status: MonitoringStatus;
  readonly cycle: number;
}

export interface MonitoringProgress {
  readonly total: number;
  readonly effective: number;
  readonly pending: readonly number[];
  readonly notEffective: readonly number[];
  /** Semua periode siklus berjalan sudah EFFECTIVE — syarat menutup klaim. */
  readonly isComplete: boolean;
}

/**
 * Keadaan pemantauan pada satu siklus.
 *
 * Hanya periode siklus berjalan yang dihitung. Periode siklus sebelumnya tidak dihapus
 * (PLAN §701) sehingga timeline tetap memperlihatkan mengapa siklus itu berakhir, tetapi
 * periode yang gagal dulu tidak boleh menghalangi penutupan klaim setelah perbaikan.
 */
export function monitoringProgress(
  periods: readonly PeriodState[],
  cycle: number,
): MonitoringProgress {
  const current = periods.filter((period) => period.cycle === cycle);
  const byNo = (a: number, b: number) => a - b;

  const effective = current.filter((period) => period.status === "EFFECTIVE");
  const pending = current
    .filter((period) => period.status === "PENDING")
    .map((period) => period.periodNo)
    .sort(byNo);
  const notEffective = current
    .filter((period) => period.status === "NOT_EFFECTIVE")
    .map((period) => period.periodNo)
    .sort(byNo);

  return {
    total: current.length,
    effective: effective.length,
    pending,
    notEffective,
    // Nol periode bukan "selesai": klaim tanpa periode apa pun belum dipantau sama
    // sekali, dan menutupnya akan berarti CAPA yang tidak pernah diuji.
    isComplete: current.length > 0 && effective.length === current.length,
  };
}

/** Alasan klaim belum boleh ditutup, atau null bila sudah boleh. */
export function closingBlocker(progress: MonitoringProgress): string | null {
  if (progress.total === 0) {
    return "Belum ada periode pemantauan pada siklus ini.";
  }

  if (progress.notEffective.length > 0) {
    return `Periode ${progress.notEffective.join(", ")} dinyatakan Not Effective.`;
  }

  if (progress.pending.length > 0) {
    return `Periode ${progress.pending.join(", ")} belum dinilai.`;
  }

  return null;
}

// ─────────────────────── Item aktivitas yang dipantau ───────────────────────

/**
 * `Attachment.entityType` untuk bukti satu item check pada satu periode.
 *
 * Dibedakan dari "MonitoringPeriod", yaitu berkas yang berlaku untuk periode secara
 * keseluruhan. Keduanya hidup berdampingan: yang satu menjawab "bukti bahwa item ini
 * diperiksa pada periode ini", yang lain "berkas pendukung periode ini".
 */
export const MONITORING_CHECK_ENTITY = "MonitoringCheck";

/** `Attachment.entityType` untuk evidence periode — dipakai sejak Modul 4 dibuka. */
export const MONITORING_PERIOD_ENTITY = "MonitoringPeriod";

export const CHECK_ITEM_MIN_LENGTH = 5;
export const CHECK_ITEM_MAX_LENGTH = 200;
export const CHECK_ITEM_COUNT_MIN = 1;
export const CHECK_ITEM_COUNT_MAX = 12;

/**
 * Hasil pemantauan yang boleh dipilih manusia.
 *
 * PENDING sengaja tidak termasuk: ia keadaan awal, bukan keputusan. Membiarkannya
 * dipilih berarti menyediakan cara untuk "membatalkan" penilaian tanpa jejak.
 */
export const CHECK_JUDGEMENTS = [
  "OK",
  "NG",
  "OK_NEED_IMPROVEMENT",
] as const satisfies readonly MonitoringJudgement[];

export type CheckJudgement = (typeof CHECK_JUDGEMENTS)[number];

export const CHECK_JUDGEMENT_LABEL: Record<MonitoringJudgement, string> = {
  PENDING: "Belum dinilai",
  OK: "OK",
  NG: "NG",
  OK_NEED_IMPROVEMENT: "OK but need improvement",
};

/** Singkatan untuk ruang sempit: kolom lembar cetak dan lencana pada kartu periode. */
export const CHECK_JUDGEMENT_SHORT: Record<MonitoringJudgement, string> = {
  PENDING: "—",
  OK: "OK",
  NG: "NG",
  OK_NEED_IMPROVEMENT: "OK-NI",
};

/** Catatan wajib pada hasil selain OK; lihat `checkJudgementSchema`. */
export const CHECK_NOTE_MIN = 10;

export interface CheckSlot {
  readonly title: string;
  readonly fileCount: number;
  readonly judgement: MonitoringJudgement;
}

/**
 * Item check yang belum punya bukti, sebagai kalimat siap tampil.
 *
 * Dipakai menahan penilaian Effective: menyatakan countermeasure berhasil sementara
 * item yang justru ditetapkan sebagai ukurannya belum dilampirkan berarti menilai dari
 * ingatan. Not Effective tidak ditahan — kegagalan tidak perlu dibuktikan dengan berkas
 * yang memang tidak pernah berhasil dikumpulkan.
 */
export function missingCheckEvidence(slots: readonly CheckSlot[]): readonly string[] {
  return slots.filter((slot) => slot.fileCount === 0).map(shortTitle);
}

function shortTitle(slot: CheckSlot): string {
  const title = slot.title.trim() || "(tanpa judul)";

  return title.length > 60 ? `${title.slice(0, 57).trimEnd()}…` : title;
}

/**
 * Item yang belum punya hasil pemantauan.
 *
 * Ikut menahan penilaian Effective, dengan sebab yang sama seperti evidence yang kosong:
 * item yang berkasnya ada tetapi tidak pernah dinilai adalah item yang tidak pernah
 * dibaca siapa pun. Berkas saja bukan kesimpulan.
 */
export function unjudgedChecks(slots: readonly CheckSlot[]): readonly string[] {
  return slots.filter((slot) => slot.judgement === "PENDING").map(shortTitle);
}

/**
 * Item yang hasilnya NG.
 *
 * **Tidak** menahan apa pun — hanya diperingatkan. Periode dengan satu item NG masih
 * boleh dinyatakan Effective: NG pada satu item check tidak selalu berarti
 * countermeasure-nya gagal, dan yang berwenang memutuskan itu verifier, bukan aturan
 * di sini. Yang dijamin hanya bahwa keputusannya diambil sambil melihat NG itu, bukan
 * tanpa menyadarinya.
 */
export function ngChecks(slots: readonly CheckSlot[]): readonly string[] {
  return slots.filter((slot) => slot.judgement === "NG").map(shortTitle);
}

// ─────────────────────── Angka hasil pemantauan ───────────────────────

export const RESULT_KINDS = ["PRODUCTION", "INSPECTION"] as const satisfies
  readonly MonitoringResultKind[];

export const RESULT_KIND_LABEL: Record<MonitoringResultKind, string> = {
  PRODUCTION: "Monitoring hasil produksi",
  INSPECTION: "Monitoring hasil inspeksi",
};

export const RESULT_KIND_SHORT: Record<MonitoringResultKind, string> = {
  PRODUCTION: "Produksi",
  INSPECTION: "Inspeksi",
};

export const RESULT_DATE_LABEL: Record<MonitoringResultKind, string> = {
  PRODUCTION: "Tanggal produksi",
  INSPECTION: "Tanggal inspeksi",
};

/**
 * Judul kolom jumlah berbeda antara kedua tabel.
 *
 * Pada produksi yang dihitung adalah keluaran line; pada inspeksi yang diperiksa. Label
 * yang seragam akan membuat tabel inspeksi terbaca sebagai salinan tabel produksi, dan
 * angkanya pun akan diisi seperti salinan.
 */
export const RESULT_QUANTITY_LABEL: Record<MonitoringResultKind, string> = {
  PRODUCTION: "Jumlah produksi",
  INSPECTION: "Jumlah diperiksa",
};

export const RESULT_QUANTITY_MAX = 1_000_000;

export interface ResultRow {
  readonly kind: MonitoringResultKind;
  readonly recordedOn: Date;
  readonly quantity: number;
  readonly okCount: number;
  readonly ngCount: number;
}

export interface ResultTotals {
  readonly rows: number;
  readonly quantity: number;
  readonly okCount: number;
  readonly ngCount: number;
  /**
   * Bagian NG dari yang sudah dinilai (0–1), atau null bila belum ada yang dinilai.
   *
   * Pembaginya OK + NG, bukan `quantity`: yang belum diperiksa belum diketahui baik atau
   * tidak, dan menghitungnya sebagai baik akan menurunkan angka NG hanya karena
   * pemeriksaannya tertinggal.
   */
  readonly ngRate: number | null;
}

const EMPTY_TOTALS: ResultTotals = {
  rows: 0,
  quantity: 0,
  okCount: 0,
  ngCount: 0,
  ngRate: null,
};

export interface ResultBalance {
  readonly judged: number;
  /** `quantity - (OK + NG)`. Positif berarti kurang, negatif berarti lebih. */
  readonly gap: number;
  readonly balanced: boolean;
}

/**
 * Apakah OK + NG menutup seluruh jumlahnya.
 *
 * Satu tempat untuk tiga pemakai yang harus sepakat: petunjuk langsung di form saat
 * diketik, penolakan di skema Zod saat dikirim, dan penanda pada baris lama yang
 * terlanjur tersimpan sebelum aturan ini ada.
 */
export function resultBalance(quantity: number, okCount: number, ngCount: number): ResultBalance {
  const judged = okCount + ngCount;

  return { judged, gap: quantity - judged, balanced: judged === quantity };
}

export function ngRate(okCount: number, ngCount: number): number | null {
  const judged = okCount + ngCount;

  return judged > 0 ? ngCount / judged : null;
}

export function totalResults(rows: readonly ResultRow[]): ResultTotals {
  if (rows.length === 0) return EMPTY_TOTALS;

  const quantity = rows.reduce((sum, row) => sum + row.quantity, 0);
  const okCount = rows.reduce((sum, row) => sum + row.okCount, 0);
  const ngCount = rows.reduce((sum, row) => sum + row.ngCount, 0);

  return { rows: rows.length, quantity, okCount, ngCount, ngRate: ngRate(okCount, ngCount) };
}

export function resultsOfKind(
  rows: readonly ResultRow[],
  kind: MonitoringResultKind,
): readonly ResultRow[] {
  return rows.filter((row) => row.kind === kind);
}

export interface CalendarRow {
  /** Tanggal kalender Jakarta, YYYY-MM-DD — juga kunci pengurutannya. */
  readonly day: string;
  /** Hari ke-berapa sejak epoch, untuk menempatkan titik pada sumbu waktu grafik. */
  readonly dayNumber: number;
  readonly date: Date;
  readonly production: ResultTotals;
  readonly inspection: ResultTotals;
}

/** Tengah hari Jakarta pada tanggal tersebut — aman dari pembulatan zona ke mana pun. */
function noonOf(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);

  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1, 5, 0, 0));
}

function dayNumberOf(day: string): number {
  return Math.round(noonOf(day).getTime() / 86_400_000);
}

/**
 * Rekap per tanggal kalender, menggabungkan kedua jenis pada baris yang sama.
 *
 * Satu baris per tanggal, bukan per catatan: satu hari dapat memiliki beberapa baris
 * produksi (mis. dua shift), dan membacanya sebagai dua hari akan membuat grafik
 * menunjukkan kenaikan frekuensi yang tidak pernah terjadi.
 *
 * Hanya tanggal yang punya catatan yang muncul. Tanggal kosong di antaranya tidak diisi
 * baris hampa — pada rentang satu bulan, deretan nol akan menenggelamkan hari yang
 * benar-benar diukur, dan jarak antar titik pada grafik sudah memperlihatkan jedanya.
 */
export function calendarRows(rows: readonly ResultRow[]): readonly CalendarRow[] {
  const byDay = new Map<string, ResultRow[]>();

  for (const row of rows) {
    const day = toJakartaDateInput(row.recordedOn);
    const list = byDay.get(day) ?? [];
    list.push(row);
    byDay.set(day, list);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, entries]) => ({
      day,
      dayNumber: dayNumberOf(day),
      date: noonOf(day),
      production: totalResults(resultsOfKind(entries, "PRODUCTION")),
      inspection: totalResults(resultsOfKind(entries, "INSPECTION")),
    }));
}
