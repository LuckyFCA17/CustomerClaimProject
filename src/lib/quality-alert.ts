import type { QtyUnit } from "@/generated/prisma/enums";

/**
 * Aturan turunan Form 5 (R3) PR-QA-ISO-07.
 *
 * Dipisah dari komponen halamannya supaya dapat diuji: keduanya menghasilkan lembar
 * yang salah secara diam-diam bila rusak, bukan lembar yang gagal dicetak.
 */

const MONTH_ABBR = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
] as const;

/** Kolom PERIOD pada formulir: bulan tiga huruf dan tahun empat digit, terpisah. */
export function periodLabel(date: Date): { month: string; year: string } {
  return {
    month: MONTH_ABBR[date.getMonth()] ?? "",
    year: String(date.getFullYear()),
  };
}

/**
 * Kolom QTY punya dua sel terpisah, "pcs" dan "box".
 *
 * Klaim hanya menyimpan satu angka beserta satuannya, jadi yang terisi adalah sel yang
 * cocok dan satunya dibiarkan kosong — bukan diisi nol, yang akan terbaca sebagai
 * "nol box" padahal satuannya memang tidak dipakai.
 */
export function splitQty(
  qty: number | null | undefined,
  unit: QtyUnit | null | undefined,
): { pcs: string | null; box: string | null } {
  if (qty === null || qty === undefined || !Number.isFinite(qty) || qty <= 0) {
    return { pcs: null, box: null };
  }

  const value = String(qty);

  return {
    pcs: unit === "PCS" ? value : null,
    box: unit === "BOX" ? value : null,
  };
}
