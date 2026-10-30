import { z } from "zod";

import {
  ClaimType,
  FailurePlaceType,
  OccurrenceCount,
  OriginPlantType,
  ProblemOrigin,
  QtyUnit,
  Shift,
} from "@/generated/prisma/enums";

/**
 * Skema form klaim (§7). Dipakai dua kali: react-hook-form memvalidasinya di peramban,
 * dan server action memvalidasi ulang kiriman yang sama sebelum menyentuh database —
 * validasi klien hanya kenyamanan, yang mengikat adalah yang di server.
 *
 * Ada dua varian:
 *   claimDraftSchema  — semua field boleh kosong, untuk auto-save tiap 30 detik
 *   claimSubmitSchema — lengkap, plus pemeriksaan antar-field sebelum klaim dikirim
 */

/**
 * Enum Prisma dibungkus apa adanya, bukan lewat Object.values, supaya tipenya tetap
 * union literal (mis. "MORNING" | "NIGHT") dan bukan luruh menjadi string — kalau luruh,
 * nilai hasil parse tidak lagi cocok dengan kolom enum Prisma.
 */
const enumField = <T extends Record<string, string>>(values: T, message: string) =>
  z.enum(values, { message });

/** Input tanggal mengirim "" saat kosong; itu bukan tanggal tidak valid, melainkan tidak diisi. */
const optionalDate = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.date({ message: "Tanggal tidak valid." }).optional(),
);

const requiredDate = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.date({ message: "Tanggal wajib diisi." }),
);

const trimmed = (max: number) => z.string().trim().max(max, `Maksimal ${max} karakter.`);

const requiredText = (label: string, max = 160) =>
  trimmed(max).min(1, `${label} wajib diisi.`);

const partPanelSchema = z.object({
  partName: requiredText("Part name"),
  nidPartNo: requiredText("NID part no."),
  qty: z.coerce
    .number({ message: "Qty harus berupa angka." })
    .positive("Qty harus lebih dari nol.")
    .max(1_000_000, "Qty terlalu besar."),
  qtyUnit: enumField(QtyUnit, "Pilih satuan."),
  dimensionItem: trimmed(300).optional().or(z.literal("")),
  appearanceItem: trimmed(300).optional().or(z.literal("")),
  photoCaption: trimmed(300).optional().or(z.literal("")),
});

/** Bentuk lengkap klaim. Pemeriksaan antar-field ditambahkan di claimSubmitSchema. */
export const claimFieldsSchema = z.object({
  // Field pertama pada form (§6 Modul 1) — menentukan kewajiban CPAR nantinya.
  type: enumField(ClaimType, "Pilih tipe klaim."),

  // A. Claim Information
  dateOfOccurrence: requiredDate,
  shiftOfOccurrence: enumField(Shift, "Pilih shift kejadian."),
  dateOfReceived: requiredDate,
  shiftOfReceived: enumField(Shift, "Pilih shift penerimaan."),
  failurePlace: requiredText("Failure place"),
  failurePlaceType: enumField(FailurePlaceType, "Pilih jenis failure place."),
  problemOrigin: enumField(ProblemOrigin, "Pilih problem internal atau external."),
  contactPerson: requiredText("Contact person"),
  contactEmail: z.string().trim().min(1, "Contact email wajib diisi.").email("Format email tidak valid."),
  contactPhone: requiredText("Contact phone", 40),
  internalPartNo: requiredText("Internal part no.", 80),
  customerPartNo: requiredText("Customer part no.", 80),
  partName: requiredText("Part name"),
  productCategoryId: z.string().min(1, "Pilih product category."),
  originPlantType: enumField(OriginPlantType, "Pilih production place."),
  originPlantDetail: trimmed(160).optional().or(z.literal("")),
  occurrence: enumField(OccurrenceCount, "Pilih occurrence."),
  ncDetailId: z.string().min(1, "Pilih non-conformance detail."),
  customerId: z.string().optional().or(z.literal("")),

  // B. Abnormal Description
  abnormalSource: requiredText("Abnormal information source"),
  qualityProblem: trimmed(4000).min(1, "Quality problem wajib diisi."),
  lotNo: requiredText("Lot no.", 80),
  kanbanNo: requiredText("Kanban no.", 80),
  injectionDate: optionalDate,
  assemblyDate: optionalDate,
  deliveryDate: optionalDate,
  suspectedProcessLine: requiredText("Suspected process line"),

  // C. Part Comparison
  standard: partPanelSchema,
  actual: partPanelSchema,
});

export type ClaimFields = z.infer<typeof claimFieldsSchema>;

/**
 * Pemeriksaan antar-field (§7). Dipisah agar bisa dipakai ulang oleh skema lain
 * dan diuji sendiri tanpa menyiapkan seluruh form.
 */
export function checkClaimDates(
  value: {
    dateOfOccurrence?: Date | undefined;
    dateOfReceived?: Date | undefined;
    injectionDate?: Date | undefined;
    assemblyDate?: Date | undefined;
    deliveryDate?: Date | undefined;
    originPlantType?: string | undefined;
    originPlantDetail?: string | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  const { dateOfOccurrence, dateOfReceived, injectionDate, assemblyDate, deliveryDate } = value;

  if (dateOfOccurrence && dateOfReceived && dateOfReceived < dateOfOccurrence) {
    ctx.addIssue({
      code: "custom",
      path: ["dateOfReceived"],
      message: "Date of received tidak boleh lebih awal dari date of occurrence.",
    });
  }

  // "Production date" pada §7 terdiri atas injection dan assembly; pengiriman tidak
  // mungkin mendahului keduanya, jadi yang dibandingkan adalah yang paling akhir.
  const productionDates = [injectionDate, assemblyDate].filter((date): date is Date => date instanceof Date);

  if (deliveryDate && productionDates.length > 0) {
    const lastProduction = new Date(Math.max(...productionDates.map((date) => date.getTime())));

    if (deliveryDate < lastProduction) {
      ctx.addIssue({
        code: "custom",
        path: ["deliveryDate"],
        message: "Delivery date tidak boleh lebih awal dari production date.",
      });
    }
  }

  if (
    (value.originPlantType === "PASSTHROUGH" || value.originPlantType === "VENDOR_SUBCON") &&
    !value.originPlantDetail?.trim()
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["originPlantDetail"],
      message: "Sebutkan nama plant atau vendor-nya.",
    });
  }
}

/** Dipakai saat QA menekan "Submit claim information". */
export const claimSubmitSchema = claimFieldsSchema.superRefine(checkClaimDates);

/**
 * Auto-save draft: semua field boleh kosong, tapi yang terisi tetap harus berbentuk benar.
 * Pemeriksaan antar-field sengaja tidak dijalankan di sini — draft yang setengah jadi
 * wajar punya tanggal yang belum konsisten, dan menolak menyimpannya akan membuang
 * pekerjaan pengguna.
 */
export const claimDraftSchema = claimFieldsSchema.partial().extend({
  standard: partPanelSchema.partial().optional(),
  actual: partPanelSchema.partial().optional(),
});

export type ClaimDraft = z.infer<typeof claimDraftSchema>;

/** Keputusan QA Dept. Head pada halaman review (§6 Modul 1). */
export const claimReviewSchema = z
  .object({
    decision: z.enum(["APPROVE", "REVISE"]),
    comment: trimmed(2000).optional().or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    if (value.decision === "REVISE" && (value.comment?.trim().length ?? 0) < 10) {
      ctx.addIssue({
        code: "custom",
        path: ["comment"],
        message: "Tuliskan apa yang perlu diperbaiki, minimal 10 karakter.",
      });
    }
  });

export type ClaimReviewInput = z.infer<typeof claimReviewSchema>;

/**
 * Bentuk nilai di dalam form.
 *
 * Semuanya string karena itulah yang dikirim elemen input, termasuk tanggal dan angka.
 * Skema Zod di atas yang mengubahnya menjadi Date dan number — di peramban untuk
 * menampilkan galat, dan sekali lagi di server sebagai pemeriksaan yang mengikat.
 */
export interface PartFormValues {
  partName: string;
  nidPartNo: string;
  qty: string;
  qtyUnit: string;
  dimensionItem: string;
  appearanceItem: string;
  photoCaption: string;
}

export interface ClaimFormValues {
  type: string;
  dateOfOccurrence: string;
  shiftOfOccurrence: string;
  dateOfReceived: string;
  shiftOfReceived: string;
  failurePlace: string;
  failurePlaceType: string;
  problemOrigin: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  internalPartNo: string;
  customerPartNo: string;
  partName: string;
  productCategoryId: string;
  originPlantType: string;
  originPlantDetail: string;
  occurrence: string;
  ncDetailId: string;
  customerId: string;
  abnormalSource: string;
  qualityProblem: string;
  lotNo: string;
  kanbanNo: string;
  injectionDate: string;
  assemblyDate: string;
  deliveryDate: string;
  suspectedProcessLine: string;
  standard: PartFormValues;
  actual: PartFormValues;
}

const EMPTY_PART: PartFormValues = {
  partName: "",
  nidPartNo: "",
  qty: "",
  qtyUnit: "PCS",
  dimensionItem: "",
  appearanceItem: "",
  photoCaption: "",
};

export const EMPTY_CLAIM_FORM: ClaimFormValues = {
  type: "",
  dateOfOccurrence: "",
  shiftOfOccurrence: "",
  dateOfReceived: "",
  shiftOfReceived: "",
  failurePlace: "",
  failurePlaceType: "",
  problemOrigin: "",
  contactPerson: "",
  contactEmail: "",
  contactPhone: "",
  internalPartNo: "",
  customerPartNo: "",
  partName: "",
  productCategoryId: "",
  originPlantType: "",
  originPlantDetail: "",
  occurrence: "",
  ncDetailId: "",
  customerId: "",
  abnormalSource: "",
  qualityProblem: "",
  lotNo: "",
  kanbanNo: "",
  injectionDate: "",
  assemblyDate: "",
  deliveryDate: "",
  suspectedProcessLine: "",
  standard: { ...EMPTY_PART },
  actual: { ...EMPTY_PART },
};
