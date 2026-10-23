import { describe, expect, it } from "vitest";

import { IGNORE_REASON_MIN, followUpSchema, ignoreSchema } from "@/schemas/cpar";

function errorsFor(
  result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } },
  field: string,
) {
  if (result.success || !result.error) return [];

  return result.error.issues
    .filter((issue) => issue.path.map(String).join(".") === field)
    .map((issue) => issue.message);
}

const PRD = "dept-production";
const ENG = "dept-engineering";
const PPIC = "dept-ppic";

function validFollowUp(overrides: Record<string, unknown> = {}) {
  return {
    responsibilityType: "USER_DEPT",
    responsibleDeptId: PRD,
    cftMemberDeptIds: [],
    initialDocumentIds: ["doc-4m", "doc-inspection"],
    dueDate: "2026-10-28",
    note: "",
    ...overrides,
  };
}

describe("penetapan penanggung jawab", () => {
  it("menerima penetapan ke satu departemen", () => {
    const result = followUpSchema.safeParse(validFollowUp());

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.dueDate).toBeInstanceOf(Date);
  });

  it("mewajibkan departemen penanggung jawab", () => {
    expect(errorsFor(followUpSchema.safeParse(validFollowUp({ responsibleDeptId: "" })), "responsibleDeptId"))
      .toEqual(["Pilih departemen penanggung jawab."]);
  });

  it("mewajibkan minimal satu dokumen yang diminta", () => {
    expect(errorsFor(followUpSchema.safeParse(validFollowUp({ initialDocumentIds: [] })), "initialDocumentIds"))
      .toEqual(["Pilih minimal satu dokumen yang diminta."]);
  });

  it("mewajibkan tenggat", () => {
    expect(errorsFor(followUpSchema.safeParse(validFollowUp({ dueDate: "" })), "dueDate").length).toBe(1);
  });

  it("menolak jenis penanggung jawab di luar dua pilihan", () => {
    expect(followUpSchema.safeParse(validFollowUp({ responsibilityType: "VENDOR" })).success).toBe(false);
  });
});

describe("aturan khusus CFT", () => {
  it("menerima CFT dengan anggota selain lead dept", () => {
    const result = followUpSchema.safeParse(
      validFollowUp({ responsibilityType: "CFT", cftMemberDeptIds: [ENG, PPIC] }),
    );

    expect(result.success).toBe(true);
  });

  it("menolak CFT tanpa anggota — itu sama saja User Department", () => {
    expect(
      errorsFor(
        followUpSchema.safeParse(validFollowUp({ responsibilityType: "CFT", cftMemberDeptIds: [] })),
        "cftMemberDeptIds",
      ),
    ).toEqual(["CFT memerlukan minimal satu departemen anggota selain lead dept."]);
  });

  it("menolak lead dept yang ikut dipilih sebagai anggota", () => {
    const result = followUpSchema.safeParse(
      validFollowUp({ responsibilityType: "CFT", cftMemberDeptIds: [PRD, ENG] }),
    );

    expect(errorsFor(result, "cftMemberDeptIds")).toContain(
      "Lead dept sudah menjadi penanggung jawab; tidak perlu dipilih lagi sebagai anggota.",
    );
  });

  it("menolak departemen yang terpilih dua kali", () => {
    const result = followUpSchema.safeParse(
      validFollowUp({ responsibilityType: "CFT", cftMemberDeptIds: [ENG, ENG] }),
    );

    expect(errorsFor(result, "cftMemberDeptIds")).toContain("Ada departemen yang terpilih dua kali.");
  });

  it("tidak mempersoalkan anggota kosong pada tipe User Department", () => {
    expect(followUpSchema.safeParse(validFollowUp({ cftMemberDeptIds: [] })).success).toBe(true);
  });
});

describe("penutupan klaim tanpa CPAR", () => {
  const alasanMemadai =
    "Part yang diklaim bukan produksi NID; nomor lot pada foto milik pemasok lain.";

  it("menerima alasan yang memadai", () => {
    expect(ignoreSchema.safeParse({ reason: alasanMemadai }).success).toBe(true);
  });

  it(`menolak alasan di bawah ${IGNORE_REASON_MIN} karakter`, () => {
    const result = ignoreSchema.safeParse({ reason: "duplikat" });

    expect(errorsFor(result, "reason")).toEqual([
      `Jelaskan alasannya, minimal ${IGNORE_REASON_MIN} karakter.`,
    ]);
  });

  it("menghitung panjang setelah spasi dibuang, bukan sebelumnya", () => {
    const padded = `${" ".repeat(60)}duplikat${" ".repeat(60)}`;

    expect(ignoreSchema.safeParse({ reason: padded }).success).toBe(false);
  });

  it("menerima konfirmasi tambahan untuk klaim yang bukan Information Only", () => {
    const result = ignoreSchema.safeParse({ reason: alasanMemadai, acknowledged: true });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.acknowledged).toBe(true);
  });

  it("tidak mewajibkan konfirmasi di tingkat skema — itu diputuskan server dari tipe klaim", () => {
    // Skema tidak tahu tipe klaimnya; aturan A-02 ditegakkan di ignoreClaim().
    expect(ignoreSchema.safeParse({ reason: alasanMemadai }).success).toBe(true);
  });
});
