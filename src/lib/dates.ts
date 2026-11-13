/**
 * Perhitungan tanggal kerja.
 *
 * Seluruhnya memakai zona Asia/Jakarta (asumsi A-15). Jakarta tidak mengenal DST, jadi
 * offsetnya tetap +07:00 sepanjang tahun dan boleh ditulis sebagai konstanta — ini tidak
 * berlaku untuk zona lain.
 */

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Jam kerja berakhir pukul 17:00 WIB; tenggat jatuh di akhir hari, bukan tengah malam. */
const END_OF_DAY_HOUR_WIB = 17;

export interface DayParts {
  readonly year: number;
  /** 0 = Januari, mengikuti Date. */
  readonly month: number;
  readonly day: number;
}

/** Diekspor agar pengelompokan per bulan di dashboard memakai kalender yang sama. */
export function toJakartaParts(date: Date): DayParts {
  const shifted = new Date(date.getTime() + JAKARTA_OFFSET_MS);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

/** 0 = Minggu, 6 = Sabtu, menurut kalender Jakarta. */
export function jakartaDayOfWeek(date: Date): number {
  return new Date(date.getTime() + JAKARTA_OFFSET_MS).getUTCDay();
}

/**
 * Hari kerja = Senin sampai Jumat.
 *
 * Libur nasional belum diperhitungkan (asumsi A-09): portal belum punya master hari
 * libur, dan menebaknya lebih berisiko daripada membiarkan QA menggeser tenggat sendiri.
 */
export function isWorkingDay(date: Date): boolean {
  const day = jakartaDayOfWeek(date);

  return day !== 0 && day !== 6;
}

/** Pukul 17:00 WIB pada tanggal yang sama, dikembalikan sebagai instan UTC. */
export function endOfWorkingDay(date: Date): Date {
  const { year, month, day } = toJakartaParts(date);

  return new Date(Date.UTC(year, month, day, END_OF_DAY_HOUR_WIB, 0, 0) - JAKARTA_OFFSET_MS);
}

/**
 * Menambah sejumlah hari kerja. Akhir pekan dilompati, dan hasilnya selalu jatuh pada
 * hari kerja — termasuk ketika titik awalnya hari Sabtu atau Minggu.
 */
export function addWorkingDays(from: Date, days: number): Date {
  let cursor = new Date(from.getTime());
  let remaining = Math.max(0, Math.trunc(days));

  while (remaining > 0) {
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    if (isWorkingDay(cursor)) remaining -= 1;
  }

  // days = 0 pada akhir pekan tetap harus mendarat di hari kerja berikutnya.
  while (!isWorkingDay(cursor)) {
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  return endOfWorkingDay(cursor);
}

/** Nomor hari sejak epoch menurut kalender Jakarta. Dasar hitungan hari kerja. */
function jakartaDayNumber(date: Date): number {
  return Math.floor((date.getTime() + JAKARTA_OFFSET_MS) / 86_400_000);
}

/** 1970-01-01 jatuh pada Kamis; 0 = Minggu, mengikuti `jakartaDayOfWeek`. */
const EPOCH_DAY_OF_WEEK = 4;

/** Banyaknya hari kerja pada rentang [0, n] menurut penomoran hari sejak epoch. */
function workingDaysThrough(n: number): number {
  if (n < 0) return 0;

  const days = n + 1;
  const weeks = Math.floor(days / 7);
  let count = weeks * 5;

  for (let index = 0; index < days % 7; index += 1) {
    const dayOfWeek = (weeks * 7 + index + EPOCH_DAY_OF_WEEK) % 7;
    if (dayOfWeek !== 0 && dayOfWeek !== 6) count += 1;
  }

  return count;
}

/**
 * Banyaknya hari kerja yang terlewati dari satu saat ke saat lain.
 *
 * Dihitung per tanggal kalender Jakarta, bukan per selisih jam: dua peristiwa pada hari
 * yang sama menghasilkan 0 berapa pun jaraknya dalam jam, dan Jumat ke Senin
 * menghasilkan 1 — akhir pekannya dilewati.
 *
 * Sejalan dengan `addWorkingDays`: `workingDaysBetween(t, addWorkingDays(t, n))` kembali
 * menghasilkan `n` untuk `t` pada hari kerja. Itu yang membuat lead time dapat
 * dibandingkan langsung dengan tenggat yang ditetapkan portal.
 *
 * Libur nasional belum diperhitungkan (asumsi A-09), sama seperti seluruh perhitungan
 * hari kerja lain di portal ini: periode yang melewati libur panjang akan terhitung
 * lebih lama daripada kenyataannya.
 */
export function workingDaysBetween(from: Date, to: Date): number {
  const start = jakartaDayNumber(from);
  const end = jakartaDayNumber(to);

  if (end <= start) return 0;

  return workingDaysThrough(end) - workingDaysThrough(start);
}

/** Tenggat pengisian CPAR bawaan: H+3 hari kerja (§6 Modul 2, asumsi A-09). */
export const DEFAULT_CPAR_DUE_WORKING_DAYS = 3;

export function defaultCparDueDate(from: Date = new Date()): Date {
  return addWorkingDays(from, DEFAULT_CPAR_DUE_WORKING_DAYS);
}

/** Nilai untuk <input type="date"> menurut kalender Jakarta, bukan UTC. */
export function toJakartaDateInput(date: Date): string {
  const { year, month, day } = toJakartaParts(date);

  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
