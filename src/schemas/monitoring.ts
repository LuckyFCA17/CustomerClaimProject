import { z } from "zod";

import { MonitoringStatus } from "@/generated/prisma/enums";
import {
  PERIOD_COUNT_MAX,
  PERIOD_COUNT_MIN,
  PERIOD_INTERVAL_MAX,
  PERIOD_INTERVAL_MIN,
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
  note: z.string().trim().max(1000, "Maksimal 1000 karakter.").optional().or(z.literal("")),
});

export type StartMonitoringInput = z.infer<typeof startMonitoringSchema>;

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
