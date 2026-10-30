import { z } from "zod";

/**
 * Temporary Corrective Action (§6 Modul 3, section 2).
 *
 * Bukan satu kotak teks: tindakan penahan hampir selalu berupa beberapa kegiatan
 * sekaligus — mengganti part, menyortir stok di pelanggan, menyortir stok sendiri —
 * dan tiap kegiatan punya angkanya. Angka yang terkubur di dalam paragraf tidak dapat
 * dijumlahkan, tidak dapat diperiksa, dan tidak dapat dipindahkan ke laporan.
 *
 * Disimpan di kolom `CparSection.data` yang memang disediakan untuk data terstruktur,
 * jadi tidak perlu tabel baru.
 */

export const TEMPORARY_ACTION_KINDS = [
  "REPLACEMENT",
  "SELECTION_CUSTOMER",
  "SELECTION_INTERNAL",
  "OTHER",
] as const;

export type TemporaryActionKind = (typeof TEMPORARY_ACTION_KINDS)[number];

export interface TemporaryActionTemplate {
  readonly kind: TemporaryActionKind;
  readonly label: string;
  readonly hint: string;
  /** Kegiatan sortir mencatat hasilnya; penggantian part tidak. */
  readonly tracksResult: boolean;
}

export const TEMPORARY_ACTION_TEMPLATES: readonly TemporaryActionTemplate[] = [
  {
    kind: "REPLACEMENT",
    label: "Replacement part",
    hint: "Jumlah part pengganti yang dikirim ke pelanggan.",
    tracksResult: false,
  },
  {
    kind: "SELECTION_CUSTOMER",
    label: "Selection stock customer",
    hint: "Sortir stok yang sudah berada di pelanggan, beserta hasilnya.",
    tracksResult: true,
  },
  {
    kind: "SELECTION_INTERNAL",
    label: "Selection stock internal",
    hint: "Sortir stok di gudang dan line NID, beserta hasilnya.",
    tracksResult: true,
  },
  {
    kind: "OTHER",
    label: "Tindakan lain",
    hint: "Tindakan penahan lain yang tidak termasuk ketiga di atas.",
    tracksResult: false,
  },
];

export function templateFor(kind: TemporaryActionKind): TemporaryActionTemplate {
  return TEMPORARY_ACTION_TEMPLATES.find((entry) => entry.kind === kind) ?? TEMPORARY_ACTION_TEMPLATES[3];
}

/** Input kosong dikirim sebagai "", dan itu berarti tidak diisi — bukan nol. */
const optionalCount = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.coerce
    .number({ message: "Isi dengan angka." })
    .int("Harus bilangan bulat.")
    .min(0, "Tidak boleh negatif.")
    .max(1_000_000, "Angka terlalu besar.")
    .optional(),
);

export const temporaryActionEntrySchema = z
  .object({
    kind: z.enum(TEMPORARY_ACTION_KINDS, { message: "Jenis tindakan tidak dikenal." }),
    /** Judul baris; dapat diubah agar satu jenis bisa dipakai lebih dari sekali. */
    label: z.string().trim().min(1, "Judul wajib diisi.").max(120, "Maksimal 120 karakter."),
    totalPcs: optionalCount,
    totalBags: optionalCount,
    okPcs: optionalCount,
    ngPcs: optionalCount,
    performedOn: z.string().trim().max(40).optional().or(z.literal("")),
    note: z.string().trim().max(1000, "Maksimal 1000 karakter.").optional().or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    const sorted = (value.okPcs ?? 0) + (value.ngPcs ?? 0);

    // Hasil sortir tidak mungkin melebihi jumlah yang disortir. Kesamaan persis tidak
    // dituntut: sortir yang masih berjalan dicatat sebelum seluruh pcs selesai dinilai.
    if (value.totalPcs !== undefined && sorted > value.totalPcs) {
      ctx.addIssue({
        code: "custom",
        path: ["okPcs"],
        message: `Hasil sortir ${sorted} pcs melebihi total ${value.totalPcs} pcs yang disortir.`,
      });
    }
  });

export type TemporaryActionEntry = z.infer<typeof temporaryActionEntrySchema>;

export const temporaryActionSchema = z.object({
  entries: z
    .array(temporaryActionEntrySchema)
    .max(20, "Maksimal 20 baris tindakan.")
    .default([]),
  /** Penjelasan bebas yang menyertai tabel; opsional. */
  note: z.string().trim().max(4000, "Maksimal 4000 karakter.").optional().or(z.literal("")),
});

export type TemporaryActionInput = z.infer<typeof temporaryActionSchema>;

/** Baris baru dengan judul bawaan jenisnya. */
export function blankEntry(kind: TemporaryActionKind): TemporaryActionEntry {
  return { kind, label: templateFor(kind).label, performedOn: "", note: "" };
}

/**
 * Membaca kembali isi kolom Json.
 *
 * Kolom itu diisi versi aplikasi yang bisa berbeda dari yang sedang membacanya, jadi
 * bentuknya diperiksa, bukan dipercaya. Baris yang tidak dikenali dilewati — lebih baik
 * kehilangan satu baris daripada menjatuhkan seluruh halaman CPAR.
 */
export function readTemporaryAction(value: unknown): TemporaryActionInput {
  const parsed = temporaryActionSchema.safeParse(value);

  if (parsed.success) return parsed.data;

  if (typeof value === "object" && value !== null && "entries" in value) {
    const raw = (value as { entries: unknown }).entries;

    if (Array.isArray(raw)) {
      const entries = raw
        .map((entry) => temporaryActionEntrySchema.safeParse(entry))
        .filter((result) => result.success)
        .map((result) => result.data);

      return { entries, note: "" };
    }
  }

  return { entries: [], note: "" };
}

export function hasTemporaryAction(value: unknown): boolean {
  return readTemporaryAction(value).entries.length > 0;
}
