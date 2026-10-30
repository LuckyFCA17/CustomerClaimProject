import { z } from "zod";

import { CparSectionKey, ResponsibilityType, VerificationDecision } from "@/generated/prisma/enums";

/**
 * Skema Modul 2 (§6): dua jalur yang saling eksklusif dari klaim yang sudah terbit.
 *
 * Keduanya memakai skema yang sama di peramban dan di server action; yang mengikat
 * adalah pemeriksaan di server.
 */

const trimmed = (max: number) => z.string().trim().max(max, `Maksimal ${max} karakter.`);

/** Jalur Follow Up — menerbitkan CPAR. */
export const followUpSchema = z
  .object({
    responsibilityType: z.enum(ResponsibilityType, { message: "Pilih jenis penanggung jawab." }),
    responsibleDeptId: z.string().min(1, "Pilih departemen penanggung jawab."),
    /** Departemen tambahan pada tipe CFT; lead dept tidak diulang di sini. */
    cftMemberDeptIds: z.array(z.string().min(1)).default([]),
    initialDocumentIds: z
      .array(z.string().min(1))
      .min(1, "Pilih minimal satu dokumen yang diminta."),
    dueDate: z.preprocess(
      (value) => (value === "" || value === null ? undefined : value),
      z.coerce.date({ message: "Tenggat wajib diisi." }),
    ),
    note: trimmed(1000).optional().or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    if (value.responsibilityType === "CFT" && value.cftMemberDeptIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["cftMemberDeptIds"],
        message: "CFT memerlukan minimal satu departemen anggota selain lead dept.",
      });
    }

    if (value.cftMemberDeptIds.includes(value.responsibleDeptId)) {
      ctx.addIssue({
        code: "custom",
        path: ["cftMemberDeptIds"],
        message: "Lead dept sudah menjadi penanggung jawab; tidak perlu dipilih lagi sebagai anggota.",
      });
    }

    if (new Set(value.cftMemberDeptIds).size !== value.cftMemberDeptIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["cftMemberDeptIds"],
        message: "Ada departemen yang terpilih dua kali.",
      });
    }
  });

export type FollowUpInput = z.infer<typeof followUpSchema>;

/**
 * Jalur Ignore — menutup klaim tanpa CPAR.
 *
 * Alasan minimal 30 karakter (§6 Modul 2) bukan sekadar batas angka: klaim yang ditutup
 * tanpa countermeasure harus meninggalkan penjelasan yang dapat dibaca auditor setahun
 * kemudian, bukan satu kata seperti "duplikat".
 */
export const IGNORE_REASON_MIN = 30;

export const ignoreSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(IGNORE_REASON_MIN, `Jelaskan alasannya, minimal ${IGNORE_REASON_MIN} karakter.`)
    .max(4000, "Maksimal 4000 karakter."),
  /** Konfirmasi tambahan untuk klaim Official dan Non-Official (asumsi A-02). */
  acknowledged: z.boolean().optional(),
});

export type IgnoreInput = z.infer<typeof ignoreSchema>;

// ─────────────────────── Modul 3: pengisian & verifikasi ───────────────────────

/**
 * Satu section CPAR (§6 Modul 3).
 *
 * Isi kosong ditolak di sini, bukan dibiarkan tersimpan lalu ketahuan saat submit final:
 * section yang "tersimpan tapi kosong" akan tampil Terisi di daftar dan menyesatkan
 * orang berikutnya yang membuka CPAR.
 */
export const SECTION_CONTENT_MIN = 10;

export const cparSectionSchema = z.object({
  key: z.enum(CparSectionKey, { message: "Section tidak dikenal." }),
  content: z
    .string()
    .trim()
    .min(SECTION_CONTENT_MIN, `Tulis isinya, minimal ${SECTION_CONTENT_MIN} karakter.`)
    .max(8000, "Maksimal 8000 karakter."),
});

export type CparSectionInput = z.infer<typeof cparSectionSchema>;

/**
 * Keputusan verifikasi (§5, §6 Modul 3).
 *
 * Komentar wajib pada REVISE: siklus berikutnya dibuka untuk orang lain, dan mereka
 * hanya punya komentar ini untuk tahu apa yang harus diperbaiki.
 */
export const VERIFY_COMMENT_MIN = 15;

export const verifySchema = z
  .object({
    decision: z.enum(VerificationDecision, { message: "Pilih keputusan verifikasi." }),
    comment: z.string().trim().max(4000, "Maksimal 4000 karakter.").optional().or(z.literal("")),
    /** Section yang ditandai bermasalah; opsional, tetapi sangat membantu pengisi. */
    targetSections: z.array(z.enum(CparSectionKey)).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.decision !== "REVISE") return;

    if ((value.comment ?? "").trim().length < VERIFY_COMMENT_MIN) {
      ctx.addIssue({
        code: "custom",
        path: ["comment"],
        message: `Sebutkan apa yang harus diperbaiki, minimal ${VERIFY_COMMENT_MIN} karakter.`,
      });
    }
  });

export type VerifyInput = z.infer<typeof verifySchema>;

/** Bentuk nilai form Follow Up; semuanya string atau array string seperti yang dikirim input. */
export interface FollowUpFormValues {
  responsibilityType: string;
  responsibleDeptId: string;
  cftMemberDeptIds: string[];
  initialDocumentIds: string[];
  dueDate: string;
  note: string;
}
