import { z } from "zod";

/**
 * Process flow diagram (§6 Modul 3, section 3).
 *
 * Mendahului kedua analisis akar masalah, dan itu bukan urutan yang sembarang: root
 * cause occurrence dan outflow sama-sama menunjuk ke sebuah proses, dan menunjuknya
 * sulit bila urutan prosesnya belum tergambar. Diagram ini yang menyediakan daftar
 * prosesnya sekaligus menandai mana yang dicurigai.
 *
 * Disimpan di `CparSection.data`, seperti tabel tindakan penahan — tanpa tabel baru.
 */

export const PROCESS_STEP_MAX = 24;

const trimmed = (max: number) => z.string().trim().max(max, `Maksimal ${max} karakter.`);

export const processStepSchema = z.object({
  name: z.string().trim().min(1, "Nama proses wajib diisi.").max(80, "Maksimal 80 karakter."),
  detail: trimmed(300).optional().or(z.literal("")),
  /**
   * Proses tempat cacat diduga terbentuk, dan proses yang seharusnya menahannya
   * tetapi meloloskannya. Satu proses dapat menjadi keduanya.
   */
  suspectOccurrence: z.coerce.boolean().default(false),
  suspectOutflow: z.coerce.boolean().default(false),
});

export type ProcessStep = z.infer<typeof processStepSchema>;

export const processFlowSchema = z.object({
  steps: z.array(processStepSchema).max(PROCESS_STEP_MAX, `Maksimal ${PROCESS_STEP_MAX} proses.`).default([]),
  note: trimmed(2000).optional().or(z.literal("")),
});

export type ProcessFlowInput = z.infer<typeof processFlowSchema>;

export function blankStep(): ProcessStep {
  return { name: "", detail: "", suspectOccurrence: false, suspectOutflow: false };
}

/** Rangkaian proses yang lazim di NID; dipakai sebagai titik awal, bukan keharusan. */
export const DEFAULT_FLOW: readonly string[] = [
  "Incoming material",
  "Injection",
  "Inspeksi proses",
  "Assembly",
  "Final inspection",
  "Packing",
  "Delivery",
];

/**
 * Membaca kembali isi kolom Json.
 *
 * Bentuknya diperiksa, bukan dipercaya: kolom itu diisi versi aplikasi yang bisa
 * berbeda dari yang membacanya. Langkah yang rusak dilewati — lebih baik kehilangan
 * satu kotak daripada menjatuhkan seluruh halaman CPAR.
 */
export function readProcessFlow(value: unknown): ProcessFlowInput {
  const parsed = processFlowSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  if (typeof value === "object" && value !== null && "steps" in value) {
    const raw = (value as { steps: unknown }).steps;

    if (Array.isArray(raw)) {
      const steps = raw
        .map((step) => processStepSchema.safeParse(step))
        .filter((result) => result.success)
        .map((result) => result.data);

      return { steps, note: "" };
    }
  }

  return { steps: [], note: "" };
}

export interface FlowCompleteness {
  readonly hasSteps: boolean;
  readonly hasOccurrence: boolean;
  readonly hasOutflow: boolean;
  readonly isComplete: boolean;
  /** Apa yang masih kurang, dalam kalimat yang dapat ditampilkan apa adanya. */
  readonly missing: readonly string[];
}

/**
 * Diagram ini baru menjalankan tugasnya ketika kedua proses suspek sudah ditandai.
 *
 * Urutan proses tanpa satu pun tanda hanyalah daftar; yang dicari analisis berikutnya
 * adalah "proses mana". Karena itu kelengkapannya menuntut keduanya — dan kekurangannya
 * disebutkan di layar jauh sebelum tombol submit ditekan, bukan baru di pop-up.
 */
export function flowCompleteness(value: ProcessFlowInput): FlowCompleteness {
  const hasSteps = value.steps.length > 0;
  const hasOccurrence = value.steps.some((step) => step.suspectOccurrence);
  const hasOutflow = value.steps.some((step) => step.suspectOutflow);

  const missing: string[] = [];
  if (!hasSteps) missing.push("urutan prosesnya belum diisi");
  if (hasSteps && !hasOccurrence) missing.push("belum ada proses yang ditandai suspek occurrence");
  if (hasSteps && !hasOutflow) missing.push("belum ada proses yang ditandai suspek outflow");

  return {
    hasSteps,
    hasOccurrence,
    hasOutflow,
    isComplete: hasSteps && hasOccurrence && hasOutflow,
    missing,
  };
}

export function hasProcessFlow(value: unknown): boolean {
  return flowCompleteness(readProcessFlow(value)).isComplete;
}
