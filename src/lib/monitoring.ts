import type { MonitoringStatus } from "@/generated/prisma/enums";
import { addWorkingDays, endOfWorkingDay } from "@/lib/dates";

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
