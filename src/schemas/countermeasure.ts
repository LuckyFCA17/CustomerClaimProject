import { z } from "zod";

/**
 * Permanent countermeasure (§6 Modul 3, section 6).
 *
 * Perbaikan tetap hampir tidak pernah satu tindakan: mengubah jig, memperbarui instruksi
 * kerja, dan menambah alat ukur dapat berjalan bersamaan, masing-masing oleh orang yang
 * berbeda dan selesai pada tanggal yang berbeda. Satu paragraf tidak dapat menjawab
 * "siapa" dan "kapan" per tindakan — dan dua pertanyaan itulah yang ditanyakan verifier.
 *
 * Disimpan di `CparSection.data`, seperti section tabel lainnya; tanpa tabel baru.
 */

export const COUNTERMEASURE_ITEM_MAX = 20;

const trimmed = (max: number) => z.string().trim().max(max, `Maksimal ${max} karakter.`);

/**
 * Tanggal dari `<input type="date">` — selalu YYYY-MM-DD.
 *
 * Disimpan sebagai teks, bukan Date: kolom Json tidak punya tipe tanggal, dan tanggal
 * implementasi adalah tanggal kalender tanpa jam. Menyimpannya sebagai timestamp akan
 * menggesernya sehari pada zona waktu tertentu.
 */
const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal belum lengkap.")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Tanggal tidak dikenal.");

export const countermeasureItemSchema = z.object({
  /**
   * Penanda baris yang tetap sama di seluruh penyimpanan.
   *
   * Evidence menempel pada id ini. Tanpa id yang bertahan, menambah satu baris di tengah
   * akan memindahkan evidence ke tindakan yang salah — dan pada lembar yang dipakai audit,
   * bukti yang menempel pada tindakan keliru lebih buruk daripada tidak ada bukti.
   * Diberikan server saat baris pertama kali disimpan.
   */
  id: z.uuid("Penanda baris tidak dikenal.").optional(),
  action: z
    .string()
    .trim()
    .min(1, "Tindakan wajib diisi.")
    .max(500, "Maksimal 500 karakter."),
  /**
   * Pengguna yang diminta mengerjakan tindakan ini.
   *
   * Wajib: perbaikan tetap tanpa nama di belakangnya adalah niat, bukan rencana — dan
   * pada verifikasi, "siapa" adalah pertanyaan pertama yang diajukan.
   */
  picId: z.string().trim().min(1, "Pilih PIC yang diminta."),
  /** Tanggal implementasi — rencana bila masih di depan, realisasi bila sudah lewat. */
  implementedOn: isoDate.optional().or(z.literal("")),
  note: trimmed(1000).optional().or(z.literal("")),
});

export type CountermeasureItem = z.infer<typeof countermeasureItemSchema>;

export const countermeasureSchema = z.object({
  items: z
    .array(countermeasureItemSchema)
    .max(COUNTERMEASURE_ITEM_MAX, `Maksimal ${COUNTERMEASURE_ITEM_MAX} tindakan.`)
    .default([]),
  /** Penjelasan yang menyertai tabel; opsional. */
  note: trimmed(4000).optional().or(z.literal("")),
});

export type CountermeasureInput = z.infer<typeof countermeasureSchema>;

export function blankItem(): CountermeasureItem {
  return { action: "", picId: "", implementedOn: "", note: "" };
}

/**
 * Membaca kembali isi kolom Json; bentuknya diperiksa, bukan dipercaya.
 *
 * Baris yang rusak dilewati satu per satu — lebih baik kehilangan satu tindakan daripada
 * menjatuhkan seluruh halaman CPAR.
 */
export function readCountermeasure(value: unknown): CountermeasureInput {
  const parsed = countermeasureSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  if (typeof value === "object" && value !== null && "items" in value) {
    const raw = (value as { items: unknown }).items;

    if (Array.isArray(raw)) {
      const items = raw
        .map((item) => countermeasureItemSchema.safeParse(item))
        .filter((result) => result.success)
        .map((result) => result.data);

      return { items, note: "" };
    }
  }

  return { items: [], note: "" };
}

/** Id baris yang sudah pernah disimpan; dipakai untuk memanggil evidence-nya. */
export function itemIds(value: CountermeasureInput): readonly string[] {
  return value.items.map((item) => item.id).filter((id): id is string => Boolean(id));
}

/**
 * Tindakan yang belum punya tanggal implementasi.
 *
 * Tidak menahan penyimpanan: rencana sering ditulis sebelum tanggalnya disepakati.
 * Yang kurang diingatkan di layar, supaya terlihat jauh sebelum tombol submit ditekan.
 */
export function withoutDate(value: CountermeasureInput): number {
  return value.items.filter((item) => !(item.implementedOn ?? "").trim()).length;
}

/** Section terisi begitu ada satu tindakan yang ditulis. */
export function hasCountermeasure(value: unknown): boolean {
  return readCountermeasure(value).items.length > 0;
}
