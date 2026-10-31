import { z } from "zod";

/**
 * Daftar tindakan bertanggung jawab — dipakai dua section CPAR (§6 Modul 3):
 * permanent countermeasure (section 6) dan standardization & horizontal deployment
 * (section 7).
 *
 * Keduanya menjawab pertanyaan yang sama bentuknya: apa yang dikerjakan, siapa yang
 * diminta, kapan diimplementasikan, dan mana buktinya. Yang berbeda hanya isinya —
 * yang satu perbaikan atas akar masalah, yang lain dokumen yang diperbarui dan line
 * lain yang menerima perbaikan serupa. Memberi keduanya skema sendiri hanya akan
 * menghasilkan dua salinan yang lambat laun berbeda tanpa alasan.
 *
 * Disimpan di `CparSection.data`, seperti section tabel lainnya; tanpa tabel baru.
 */

export const ACTION_ITEM_MAX = 20;

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

export const actionItemSchema = z.object({
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
    .min(1, "Isian wajib diisi.")
    .max(500, "Maksimal 500 karakter."),
  /**
   * Pengguna yang diminta mengerjakan tindakan ini.
   *
   * Wajib: tindakan tanpa nama di belakangnya adalah niat, bukan rencana — dan pada
   * verifikasi, "siapa" adalah pertanyaan pertama yang diajukan.
   */
  picId: z.string().trim().min(1, "Pilih PIC yang diminta."),
  /** Tanggal implementasi — rencana bila masih di depan, realisasi bila sudah lewat. */
  implementedOn: isoDate.optional().or(z.literal("")),
  note: trimmed(1000).optional().or(z.literal("")),
});

export type ActionItem = z.infer<typeof actionItemSchema>;

export const actionPlanSchema = z.object({
  items: z
    .array(actionItemSchema)
    .max(ACTION_ITEM_MAX, `Maksimal ${ACTION_ITEM_MAX} baris.`)
    .default([]),
  /** Penjelasan yang menyertai tabel; opsional. */
  note: trimmed(4000).optional().or(z.literal("")),
});

export type ActionPlanInput = z.infer<typeof actionPlanSchema>;

export function blankItem(): ActionItem {
  return { action: "", picId: "", implementedOn: "", note: "" };
}

/**
 * Membaca kembali isi kolom Json; bentuknya diperiksa, bukan dipercaya.
 *
 * Baris yang rusak dilewati satu per satu — lebih baik kehilangan satu baris daripada
 * menjatuhkan seluruh halaman CPAR.
 */
export function readActionPlan(value: unknown): ActionPlanInput {
  const parsed = actionPlanSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  if (typeof value === "object" && value !== null && "items" in value) {
    const raw = (value as { items: unknown }).items;

    if (Array.isArray(raw)) {
      const items = raw
        .map((item) => actionItemSchema.safeParse(item))
        .filter((result) => result.success)
        .map((result) => result.data);

      return { items, note: "" };
    }
  }

  return { items: [], note: "" };
}

/** Id baris yang sudah pernah disimpan; dipakai untuk memanggil evidence-nya. */
export function itemIds(value: ActionPlanInput): readonly string[] {
  return value.items.map((item) => item.id).filter((id): id is string => Boolean(id));
}

/**
 * Baris yang belum punya tanggal implementasi.
 *
 * Tidak menahan penyimpanan: rencana sering ditulis sebelum tanggalnya disepakati.
 * Yang kurang diingatkan di layar, supaya terlihat jauh sebelum tombol submit ditekan.
 */
export function withoutDate(value: ActionPlanInput): number {
  return value.items.filter((item) => !(item.implementedOn ?? "").trim()).length;
}

/** Section terisi begitu ada satu baris yang ditulis. */
export function hasActionPlan(value: unknown): boolean {
  return readActionPlan(value).items.length > 0;
}
