import { z } from "zod";

import { ResponsibilityType } from "@/generated/prisma/enums";

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

/** Bentuk nilai form Follow Up; semuanya string atau array string seperti yang dikirim input. */
export interface FollowUpFormValues {
  responsibilityType: string;
  responsibleDeptId: string;
  cftMemberDeptIds: string[];
  initialDocumentIds: string[];
  dueDate: string;
  note: string;
}
