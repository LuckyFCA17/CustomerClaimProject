import { z } from "zod";

import { MonitoringResultKind, MonitoringStatus } from "@/generated/prisma/enums";
import {
  CHECK_JUDGEMENTS,
  CHECK_NOTE_MIN,
  CHECK_ITEM_COUNT_MAX,
  CHECK_ITEM_COUNT_MIN,
  CHECK_ITEM_MAX_LENGTH,
  CHECK_ITEM_MIN_LENGTH,
  PERIOD_COUNT_MAX,
  PERIOD_COUNT_MIN,
  PERIOD_INTERVAL_MAX,
  PERIOD_INTERVAL_MIN,
  RESULT_QUANTITY_MAX,
} from "@/lib/monitoring";

/**
 * Skema Modul 4 (§6) — pemantauan efektivitas CAPA.
 *
 * Dipakai di peramban dan di server action; yang mengikat adalah pemeriksaan di server.
 */

/** Jalur Action Button C — membuka jadwal pemantauan. */
export const startMonitoringSchema = z.object({
  periodCount: z.coerce
    .number({ message: "Jumlah periode wajib diisi." })
    .int("Jumlah periode harus bilangan bulat.")
    .min(PERIOD_COUNT_MIN, `Minimal ${PERIOD_COUNT_MIN} periode.`)
    .max(PERIOD_COUNT_MAX, `Maksimal ${PERIOD_COUNT_MAX} periode.`),
  intervalDays: z.coerce
    .number({ message: "Jarak antar periode wajib diisi." })
    .int("Jarak antar periode harus bilangan bulat.")
    .min(PERIOD_INTERVAL_MIN, `Minimal ${PERIOD_INTERVAL_MIN} hari kerja.`)
    .max(PERIOD_INTERVAL_MAX, `Maksimal ${PERIOD_INTERVAL_MAX} hari kerja.`),
  /**
   * Item aktivitas yang dipantau — apa yang akan diperiksa tiap periode.
   *
   * Wajib minimal satu, dan ditetapkan di muka: inilah yang nanti dilampirkan sebagai
   * bukti efektivitas. Pemantauan yang dibuka tanpa menyebut apa yang diukur berakhir
   * dengan penilaian yang mencari bukti apa saja yang kebetulan tersedia pada hari
   * penilaian, bukan bukti atas hal yang memang direncanakan diperiksa.
   */
  checkItems: z
    .array(z.string().trim())
    .transform((items) => items.map((item) => item.trim()).filter((item) => item.length > 0))
    .pipe(
      z
        .array(
          z
            .string()
            .min(CHECK_ITEM_MIN_LENGTH, `Tiap item minimal ${CHECK_ITEM_MIN_LENGTH} karakter.`)
            .max(CHECK_ITEM_MAX_LENGTH, `Maksimal ${CHECK_ITEM_MAX_LENGTH} karakter per item.`),
        )
        .min(CHECK_ITEM_COUNT_MIN, "Sebutkan minimal satu item yang dipantau.")
        .max(CHECK_ITEM_COUNT_MAX, `Maksimal ${CHECK_ITEM_COUNT_MAX} item.`),
    )
    .refine(
      (items) => new Set(items.map((item) => item.toLowerCase())).size === items.length,
      "Ada item yang ditulis dua kali.",
    ),
  note: z.string().trim().max(1000, "Maksimal 1000 karakter.").optional().or(z.literal("")),
});

export type StartMonitoringInput = z.infer<typeof startMonitoringSchema>;

/**
 * Satu baris angka hasil produksi atau inspeksi.
 *
 * **`okCount + ngCount` harus sama persis dengan `quantity`.** Tiap part yang dihitung
 * punya satu keputusan: OK atau NG. Tidak ada kategori ketiga, jadi selisih berapa pun
 * berarti ada angka yang salah ketik — dan itulah yang paling sering terjadi, karena
 * ketiganya disalin dari lembar lain.
 *
 * Aturan ini semula hanya satu arah (menolak yang melebihi, membiarkan yang kurang),
 * dengan alasan sisanya "belum diperiksa". Alasan itu keliru untuk form ini: kolom
 * jumlahnya adalah **yang diproduksi** dan **yang diperiksa**, bukan yang direncanakan.
 * Baris 5.000 / OK 2.000 / NG 100 lolos tanpa suara, lalu masuk ke rekap dan grafik
 * sebagai NG 4,8% — padahal 2.900 part tidak pernah dipertanggungjawabkan.
 *
 * Yang dicatat sebagian cukup ditulis apa adanya: jumlahnya diisi sebanyak yang memang
 * sudah diperiksa, dan sisanya menjadi baris tersendiri saat gilirannya tiba.
 */
export const monitoringResultSchema = z
  .object({
    kind: z.enum(MonitoringResultKind, { message: "Pilih jenis pencatatan." }),
    recordedOn: z.preprocess(
      (value) => (value === "" || value === null ? undefined : value),
      z.coerce.date({ message: "Tanggal wajib diisi." }),
    ),
    quantity: z.coerce
      .number({ message: "Jumlah wajib diisi." })
      .int("Jumlah harus bilangan bulat.")
      .min(1, "Jumlah minimal 1.")
      .max(RESULT_QUANTITY_MAX, `Maksimal ${RESULT_QUANTITY_MAX.toLocaleString("id-ID")}.`),
    okCount: z.coerce
      .number({ message: "Total OK wajib diisi." })
      .int("Total OK harus bilangan bulat.")
      .min(0, "Total OK tidak boleh negatif.")
      .max(RESULT_QUANTITY_MAX, "Total OK melebihi batas."),
    ngCount: z.coerce
      .number({ message: "Total NG wajib diisi." })
      .int("Total NG harus bilangan bulat.")
      .min(0, "Total NG tidak boleh negatif.")
      .max(RESULT_QUANTITY_MAX, "Total NG melebihi batas."),
    note: z.string().trim().max(500, "Maksimal 500 karakter.").optional().or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    const judged = value.okCount + value.ngCount;
    if (judged === value.quantity) return;

    const gap = Math.abs(judged - value.quantity);
    const direction = judged > value.quantity ? "melebihi" : "kurang dari";

    ctx.addIssue({
      code: "custom",
      path: ["okCount"],
      message:
        `OK + NG = ${judged.toLocaleString("id-ID")}, ${direction} jumlahnya ` +
        `(${value.quantity.toLocaleString("id-ID")}) sebanyak ${gap.toLocaleString("id-ID")}. ` +
        `Tiap part harus terhitung sebagai OK atau NG.`,
    });
  });

export type MonitoringResultInput = z.infer<typeof monitoringResultSchema>;

/**
 * Hasil pemantauan satu item check, beserta catatannya.
 *
 * Catatan wajib untuk hasil selain OK. "NG" sendirian tidak memberi tahu apa pun kepada
 * yang harus memperbaikinya, dan "OK but need improvement" tanpa penjelasan adalah
 * perbaikan yang tidak pernah akan dikerjakan karena tidak ada yang tahu apa yang kurang.
 *
 * Pada OK pun catatannya boleh diisi — angka hasil pengukuran sering ditulis di sana.
 */
export const checkJudgementSchema = z
  .object({
    judgement: z.enum(CHECK_JUDGEMENTS, { message: "Pilih hasil pemantauan." }),
    note: z.string().trim().max(1000, "Maksimal 1000 karakter.").optional().or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    if (value.judgement === "OK") return;

    if ((value.note ?? "").trim().length < CHECK_NOTE_MIN) {
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: `Jelaskan temuannya, minimal ${CHECK_NOTE_MIN} karakter.`,
      });
    }
  });

export type CheckJudgementInput = z.infer<typeof checkJudgementSchema>;

/**
 * Penilaian efektivitas satu periode.
 *
 * Catatan wajib pada NOT_EFFECTIVE: keputusan itu memulangkan klaim ke CPAR_REVISION
 * dan menaikkan siklus, dan orang yang harus memperbaiki hanya punya catatan ini untuk
 * tahu apa yang belum berhasil.
 */
export const EFFECTIVENESS_NOTE_MIN = 15;

export const effectivenessSchema = z
  .object({
    result: z.enum(
      // PENDING adalah keadaan awal, bukan keputusan — tidak boleh dipilih manusia.
      [MonitoringStatus.EFFECTIVE, MonitoringStatus.NOT_EFFECTIVE],
      { message: "Pilih hasil penilaian." },
    ),
    note: z.string().trim().max(4000, "Maksimal 4000 karakter.").optional().or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    if (value.result !== "NOT_EFFECTIVE") return;

    if ((value.note ?? "").trim().length < EFFECTIVENESS_NOTE_MIN) {
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: `Jelaskan apa yang belum berhasil, minimal ${EFFECTIVENESS_NOTE_MIN} karakter.`,
      });
    }
  });

export type EffectivenessInput = z.infer<typeof effectivenessSchema>;

/**
 * Improvement Report penutup (§6 Modul 4).
 *
 * Blok A3 opsional satu per satu, tetapi ringkasannya wajib: inilah satu-satunya bagian
 * yang terbaca orang yang membuka klaim ini setahun kemudian tanpa membaca seluruh CPAR.
 */
export const REPORT_SUMMARY_MIN = 40;

const a3Block = z.string().trim().max(4000, "Maksimal 4000 karakter.").optional().or(z.literal(""));

export const improvementReportSchema = z.object({
  summary: z
    .string()
    .trim()
    .min(REPORT_SUMMARY_MIN, `Ringkasan minimal ${REPORT_SUMMARY_MIN} karakter.`)
    .max(8000, "Maksimal 8000 karakter."),
  lessonLearned: z.string().trim().max(4000, "Maksimal 4000 karakter.").optional().or(z.literal("")),
  background: a3Block,
  target: a3Block,
  analysis: a3Block,
  plan: a3Block,
  result: a3Block,
});

export type ImprovementReportInput = z.infer<typeof improvementReportSchema>;

/** Blok A3 yang disimpan di `ImprovementReport.a3Content`. */
export const A3_BLOCKS = ["background", "target", "analysis", "plan", "result"] as const;

export type A3Block = (typeof A3_BLOCKS)[number];

export const A3_BLOCK_LABEL: Record<A3Block, string> = {
  background: "Background",
  target: "Target",
  analysis: "Analysis",
  plan: "Plan",
  result: "Result",
};
