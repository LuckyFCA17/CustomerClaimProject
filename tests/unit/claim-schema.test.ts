import { describe, expect, it } from "vitest";

import { claimDraftSchema, claimReviewSchema, claimSubmitSchema } from "@/schemas/claim";

/** Klaim lengkap yang lolos validasi — tiap pengujian hanya mengubah satu hal darinya. */
function validClaim(overrides: Record<string, unknown> = {}) {
  return {
    type: "OFFICIAL",
    dateOfOccurrence: "2026-10-01",
    shiftOfOccurrence: "MORNING",
    dateOfReceived: "2026-10-03",
    shiftOfReceived: "NIGHT",
    failurePlace: "Line Assy 5 — Customer Plant Karawang",
    failurePlaceType: "DOMESTIC",
    contactPerson: "Andi Wijaya",
    contactEmail: "andi.wijaya@tmmin.co.id",
    contactPhone: "+62 812-1100-2200",
    internalPartNo: "NID-4451-02",
    customerPartNo: "90467-09201",
    partName: "Clip Fastener Bumper",
    productCategoryId: "pc-critical",
    originPlantType: "NID",
    occurrence: "FIRST_TIME",
    ncDetailId: "nc-crack",
    abnormalSource: "Temuan line stop customer",
    qualityProblem: "Clip patah pada kaki pengunci saat pemasangan bumper.",
    lotNo: "LOT-26-0705",
    kanbanNo: "KB-4451-889",
    injectionDate: "2026-09-20",
    assemblyDate: "2026-09-22",
    deliveryDate: "2026-09-25",
    suspectedProcessLine: "Injection line 1, mold cavity 4",
    standard: {
      partName: "Clip Fastener Bumper",
      nidPartNo: "NID-4451-02",
      qty: 1,
      qtyUnit: "PCS",
      dimensionItem: "Tebal kaki 1.80 ± 0.10 mm",
      appearanceItem: "Tanpa retak",
    },
    actual: {
      partName: "Clip Fastener Bumper",
      nidPartNo: "NID-4451-02",
      qty: 46,
      qtyUnit: "PCS",
      dimensionItem: "Tebal kaki 1.62 mm",
      appearanceItem: "Retak rambut pada pangkal kaki",
    },
    ...overrides,
  };
}

/** Pesan galat untuk satu field, supaya pengujian membaca maksudnya dan bukan indeksnya. */
function errorsFor(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, field: string) {
  if (result.success || !result.error) return [];

  return result.error.issues
    .filter((issue) => issue.path.map(String).join(".") === field)
    .map((issue) => issue.message);
}

describe("klaim lengkap", () => {
  it("menerima klaim yang terisi benar dan mengubah tanggal menjadi Date", () => {
    const result = claimSubmitSchema.safeParse(validClaim());

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.dateOfOccurrence).toBeInstanceOf(Date);
    expect(result.data.dateOfOccurrence.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(result.data.actual.qty).toBe(46);
  });

  it("menolak klaim kosong dengan menyebut field yang wajib", () => {
    const result = claimSubmitSchema.safeParse({});

    expect(result.success).toBe(false);
    expect(errorsFor(result, "type").length).toBeGreaterThan(0);
    expect(errorsFor(result, "contactEmail").length).toBeGreaterThan(0);
    expect(errorsFor(result, "standard").length + errorsFor(result, "standard.partName").length)
      .toBeGreaterThan(0);
  });
});

describe("aturan tanggal (§7)", () => {
  it("menolak date of received yang mendahului date of occurrence", () => {
    const result = claimSubmitSchema.safeParse(
      validClaim({ dateOfOccurrence: "2026-10-05", dateOfReceived: "2026-10-01" }),
    );

    expect(errorsFor(result, "dateOfReceived")).toEqual([
      "Date of received tidak boleh lebih awal dari date of occurrence.",
    ]);
  });

  it("menerima date of received pada hari yang sama", () => {
    const result = claimSubmitSchema.safeParse(
      validClaim({ dateOfOccurrence: "2026-10-05", dateOfReceived: "2026-10-05" }),
    );

    expect(result.success).toBe(true);
  });

  it("menolak delivery date yang mendahului production date", () => {
    const result = claimSubmitSchema.safeParse(
      validClaim({ injectionDate: "2026-09-20", assemblyDate: "2026-09-22", deliveryDate: "2026-09-21" }),
    );

    expect(errorsFor(result, "deliveryDate")).toEqual([
      "Delivery date tidak boleh lebih awal dari production date.",
    ]);
  });

  it("membandingkan delivery date dengan tanggal produksi paling akhir, bukan yang pertama", () => {
    // Injection 20 Sep, assembly 28 Sep, kirim 25 Sep — mustahil, walau lewat dari injection.
    const result = claimSubmitSchema.safeParse(
      validClaim({ injectionDate: "2026-09-20", assemblyDate: "2026-09-28", deliveryDate: "2026-09-25" }),
    );

    expect(errorsFor(result, "deliveryDate").length).toBe(1);
  });

  it("melewati pemeriksaan produksi bila tanggalnya memang tidak diisi", () => {
    const result = claimSubmitSchema.safeParse(
      validClaim({ injectionDate: "", assemblyDate: "", deliveryDate: "2026-09-25" }),
    );

    expect(result.success).toBe(true);
  });
});

describe("production place", () => {
  it("mewajibkan keterangan untuk Passthrough", () => {
    const result = claimSubmitSchema.safeParse(
      validClaim({ originPlantType: "PASSTHROUGH", originPlantDetail: "" }),
    );

    expect(errorsFor(result, "originPlantDetail")).toEqual(["Sebutkan nama plant atau vendor-nya."]);
  });

  it("mewajibkan keterangan untuk Vendor/Sub-Contractor", () => {
    const result = claimSubmitSchema.safeParse(validClaim({ originPlantType: "VENDOR_SUBCON" }));

    expect(errorsFor(result, "originPlantDetail").length).toBe(1);
  });

  it("tidak mewajibkan keterangan untuk produksi NID sendiri", () => {
    const result = claimSubmitSchema.safeParse(validClaim({ originPlantType: "NID" }));

    expect(result.success).toBe(true);
  });
});

describe("field lain", () => {
  it("menolak format email yang salah", () => {
    expect(errorsFor(claimSubmitSchema.safeParse(validClaim({ contactEmail: "andi@" })), "contactEmail"))
      .toEqual(["Format email tidak valid."]);
  });

  it("menolak qty nol atau negatif", () => {
    const zero = claimSubmitSchema.safeParse(
      validClaim({ actual: { ...validClaim().actual, qty: 0 } }),
    );

    expect(errorsFor(zero, "actual.qty")).toEqual(["Qty harus lebih dari nol."]);
  });

  it("menolak satuan qty di luar Pcs dan Box", () => {
    const result = claimSubmitSchema.safeParse(
      validClaim({ actual: { ...validClaim().actual, qtyUnit: "KG" } }),
    );

    expect(errorsFor(result, "actual.qtyUnit").length).toBe(1);
  });

  it("membuang spasi berlebih di sekeliling teks", () => {
    const result = claimSubmitSchema.safeParse(validClaim({ lotNo: "  LOT-26-0705  " }));

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.lotNo).toBe("LOT-26-0705");
  });

  it("menolak tipe klaim di luar tiga pilihan §6", () => {
    expect(errorsFor(claimSubmitSchema.safeParse(validClaim({ type: "URGENT" })), "type").length).toBe(1);
  });
});

describe("auto-save draft", () => {
  it("menerima draft yang masih kosong sama sekali", () => {
    expect(claimDraftSchema.safeParse({}).success).toBe(true);
  });

  it("menerima draft yang baru terisi sebagian", () => {
    const result = claimDraftSchema.safeParse({
      type: "NON_OFFICIAL",
      partName: "Grommet Wire Harness",
      actual: { partName: "Grommet Wire Harness" },
    });

    expect(result.success).toBe(true);
  });

  it("tidak menolak draft yang tanggalnya belum konsisten (asumsi A-17)", () => {
    const result = claimDraftSchema.safeParse({
      dateOfOccurrence: "2026-10-05",
      dateOfReceived: "2026-10-01",
    });

    expect(result.success).toBe(true);
  });

  it("tetap menolak isian yang bentuknya salah", () => {
    expect(errorsFor(claimDraftSchema.safeParse({ contactEmail: "bukan-email" }), "contactEmail").length)
      .toBe(1);
    expect(errorsFor(claimDraftSchema.safeParse({ dateOfOccurrence: "32 Oktober" }), "dateOfOccurrence").length)
      .toBe(1);
  });
});

describe("keputusan review QA Dept. Head", () => {
  it("menerima approve tanpa komentar", () => {
    expect(claimReviewSchema.safeParse({ decision: "APPROVE" }).success).toBe(true);
  });

  it("mewajibkan komentar yang berisi saat meminta revisi", () => {
    expect(errorsFor(claimReviewSchema.safeParse({ decision: "REVISE" }), "comment")).toEqual([
      "Tuliskan apa yang perlu diperbaiki, minimal 10 karakter.",
    ]);

    expect(errorsFor(claimReviewSchema.safeParse({ decision: "REVISE", comment: "kurang" }), "comment").length)
      .toBe(1);
  });

  it("menerima permintaan revisi yang komentarnya memadai", () => {
    const result = claimReviewSchema.safeParse({
      decision: "REVISE",
      comment: "Lot no. belum sesuai dengan delivery record; mohon dicek ulang.",
    });

    expect(result.success).toBe(true);
  });

  it("menolak keputusan di luar approve dan revise", () => {
    expect(claimReviewSchema.safeParse({ decision: "HOLD" }).success).toBe(false);
  });
});
