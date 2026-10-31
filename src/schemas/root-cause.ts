import { z } from "zod";

/**
 * Analisis akar masalah 4M1E (§6 Modul 3, section 4 dan 5).
 *
 * Diagram tulang ikan dan tabel 4M1E bukan dua isian yang berbeda, melainkan dua
 * tampilan dari data yang sama: tiap faktor adalah satu duri pada kategori tulangnya,
 * sekaligus satu baris pada tabel. Dipisahkan menjadi dua isian, keduanya akan segera
 * berbeda isi — dan yang satu akan menjadi gambar yang tidak lagi menggambarkan apa pun.
 */

export const FISHBONE_CATEGORIES = ["MAN", "MACHINE", "METHOD", "MATERIAL", "ENVIRONMENT"] as const;

export type FishboneCategory = (typeof FISHBONE_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<FishboneCategory, string> = {
  MAN: "Man",
  MACHINE: "Machine",
  METHOD: "Method",
  MATERIAL: "Material",
  ENVIRONMENT: "Environment",
};

export const CATEGORY_HINT: Record<FishboneCategory, string> = {
  MAN: "Operator, keterampilan, kepatuhan terhadap instruksi kerja.",
  MACHINE: "Mesin, jig, cetakan, alat ukur, dan parameternya.",
  METHOD: "Cara kerja, urutan proses, standar dan instruksi kerja.",
  MATERIAL: "Material, komponen, lot, dan penyimpanannya.",
  ENVIRONMENT: "Suhu, kelembapan, kebersihan, pencahayaan, tata letak.",
};

/**
 * Tiga keputusan per faktor.
 *
 * "OK but need improvement" bukan nilai tengah yang samar: ia berarti faktornya tidak
 * menyebabkan cacat ini, tetapi standarnya tetap perlu diperbaiki — dan itu sering
 * menjadi asal tindakan pencegahan yang tidak akan muncul bila hanya ada OK dan NG.
 */
export const JUDGEMENTS = ["OK", "NG", "OK_NEED_IMPROVEMENT"] as const;

export type Judgement = (typeof JUDGEMENTS)[number];

export const JUDGEMENT_LABEL: Record<Judgement, string> = {
  OK: "OK",
  NG: "NG",
  OK_NEED_IMPROVEMENT: "OK but need improvement",
};

/** Singkatan untuk ruang sempit: duri pada diagram dan kolom pada lembar cetak. */
export const JUDGEMENT_SHORT: Record<Judgement, string> = {
  OK: "OK",
  NG: "NG",
  OK_NEED_IMPROVEMENT: "OK-NI",
};

const trimmed = (max: number) => z.string().trim().max(max, `Maksimal ${max} karakter.`);

/** Sedalam-dalamnya rantai "mengapa" pada satu faktor. */
export const WHY_DEPTH = 5;

export const rootCauseFactorSchema = z
  .object({
    category: z.enum(FISHBONE_CATEGORIES, { message: "Pilih kategori 4M1E." }),
    /** Faktor yang diperiksa, mis. "Setting tekanan holding". */
    item: z.string().trim().min(1, "Item 4M1E wajib diisi.").max(120, "Maksimal 120 karakter."),
    /** Standar acuannya — angka, dokumen, atau ketentuan yang seharusnya berlaku. */
    controlPoint: trimmed(300).optional().or(z.literal("")),
    /** Kondisi yang benar-benar ditemukan saat diperiksa. */
    actual: trimmed(300).optional().or(z.literal("")),
    judgement: z.enum(JUDGEMENTS, { message: "Pilih judgement." }),
    note: trimmed(500).optional().or(z.literal("")),
    /**
     * Rantai 5 Why untuk faktor ini.
     *
     * Menempel pada faktor, bukan pada section: rantai yang berdiri sendiri di bawah
     * tabel tidak menyebut jawaban "mengapa" yang mana — sedangkan yang ditelusuri
     * justru faktor tertentu yang dinilai NG.
     */
    whys: z.array(trimmed(300)).max(WHY_DEPTH, `Maksimal ${WHY_DEPTH} tingkat.`).default([]),
  })
  .superRefine((value, ctx) => {
    // Rantai tidak boleh berlubang: "Why 3" yang terisi sementara "Why 2" kosong
    // memutus sebab-akibatnya, dan pembacanya tidak dapat tahu apa yang hilang.
    const filled = value.whys.map((why) => why.trim().length > 0);
    const lastFilled = filled.lastIndexOf(true);

    for (let index = 0; index < lastFilled; index += 1) {
      if (!filled[index]) {
        ctx.addIssue({
          code: "custom",
          path: ["whys", index],
          message: `Why ${index + 1} belum diisi, padahal Why ${lastFilled + 1} sudah.`,
        });
      }
    }
  });

export type RootCauseFactor = z.infer<typeof rootCauseFactorSchema>;

export const ROOT_CAUSE_FACTOR_MAX = 30;

export const rootCauseSchema = z.object({
  /** Akibat yang dianalisis — kepala ikan pada diagram. */
  problem: trimmed(200).optional().or(z.literal("")),
  factors: z
    .array(rootCauseFactorSchema)
    .max(ROOT_CAUSE_FACTOR_MAX, `Maksimal ${ROOT_CAUSE_FACTOR_MAX} faktor.`)
    .default([]),
  /** Kesimpulan akar masalah setelah seluruh faktor dinilai. */
  conclusion: trimmed(2000).optional().or(z.literal("")),
});

export type RootCauseInput = z.infer<typeof rootCauseSchema>;

export function blankFactor(category: FishboneCategory): RootCauseFactor {
  return { category, item: "", controlPoint: "", actual: "", judgement: "OK", note: "", whys: [] };
}

/** Tingkat "mengapa" yang benar-benar terisi, tanpa ekor kosong. */
export function filledWhys(factor: RootCauseFactor): readonly string[] {
  const whys = (factor.whys ?? []).map((why) => why.trim());
  const last = whys.map((why) => why.length > 0).lastIndexOf(true);

  return last === -1 ? [] : whys.slice(0, last + 1);
}

/**
 * Jawaban terdalam pada rantai — akar masalah yang ditemukan faktor ini.
 *
 * Bukan selalu tingkat kelima: rantai yang jujur kadang berhenti di tingkat ketiga
 * karena sudah sampai sebab yang dapat dikendalikan, dan memaksanya sampai lima hanya
 * menghasilkan dua baris yang mengulang.
 */
export function rootOf(factor: RootCauseFactor): string | null {
  const whys = filledWhys(factor);

  return whys.length > 0 ? whys[whys.length - 1] : null;
}

/** Faktor yang punya rantai 5 Why, dalam urutan tabelnya. */
export function factorsWithWhys(value: RootCauseInput): readonly RootCauseFactor[] {
  return value.factors.filter((factor) => filledWhys(factor).length > 0);
}

/**
 * Membaca kembali isi kolom Json; bentuknya diperiksa, bukan dipercaya.
 *
 * Faktor yang rusak dilewati satu per satu — lebih baik kehilangan satu duri daripada
 * menjatuhkan seluruh halaman CPAR.
 */
export function readRootCause(value: unknown): RootCauseInput {
  const parsed = rootCauseSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  if (typeof value === "object" && value !== null && "factors" in value) {
    const raw = (value as { factors: unknown }).factors;

    if (Array.isArray(raw)) {
      const factors = raw
        .map((factor) => rootCauseFactorSchema.safeParse(factor))
        .filter((result) => result.success)
        .map((result) => result.data);

      return { problem: "", factors, conclusion: "" };
    }
  }

  return { problem: "", factors: [], conclusion: "" };
}

/** Faktor per kategori, dalam urutan tetap — dipakai diagram maupun tabel. */
export function groupByCategory(
  value: RootCauseInput,
): readonly { category: FishboneCategory; factors: readonly RootCauseFactor[] }[] {
  return FISHBONE_CATEGORIES.map((category) => ({
    category,
    factors: value.factors.filter((factor) => factor.category === category),
  }));
}

export function countNg(value: RootCauseInput): number {
  return value.factors.filter((factor) => factor.judgement === "NG").length;
}

/**
 * Section terisi ketika ada setidaknya satu faktor yang diperiksa.
 *
 * Sengaja tidak menuntut adanya faktor NG: analisis yang jujur dapat menyimpulkan
 * seluruh faktor pada satu sisi memang sesuai standar, dan akar masalahnya ada di sisi
 * lain. Yang kurang hanya diingatkan di layar, bukan menahan submit.
 */
export function hasRootCause(value: unknown): boolean {
  return readRootCause(value).factors.length > 0;
}
