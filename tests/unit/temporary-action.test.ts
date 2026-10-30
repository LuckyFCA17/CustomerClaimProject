import { describe, expect, it } from "vitest";

import { isSectionFilled, missingRequiredSections } from "@/lib/cpar";
import {
  TEMPORARY_ACTION_TEMPLATES,
  blankEntry,
  hasTemporaryAction,
  readTemporaryAction,
  temporaryActionEntrySchema,
  temporaryActionSchema,
  templateFor,
} from "@/schemas/temporary-action";

function errorsFor(
  result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } },
  field: string,
) {
  if (result.success || !result.error) return [];

  return result.error.issues
    .filter((issue) => issue.path.map(String).join(".") === field)
    .map((issue) => issue.message);
}

const sortir = {
  kind: "SELECTION_CUSTOMER",
  label: "Selection stock customer",
  totalPcs: "500",
  totalBags: "10",
  okPcs: "497",
  ngPcs: "3",
};

describe("template", () => {
  it("menyediakan tiga template yang diminta beserta satu tindakan bebas", () => {
    expect(TEMPORARY_ACTION_TEMPLATES.map((entry) => entry.kind)).toEqual([
      "REPLACEMENT",
      "SELECTION_CUSTOMER",
      "SELECTION_INTERNAL",
      "OTHER",
    ]);
  });

  it("hanya kegiatan sortir yang mencatat hasil OK/NG", () => {
    expect(templateFor("SELECTION_CUSTOMER").tracksResult).toBe(true);
    expect(templateFor("SELECTION_INTERNAL").tracksResult).toBe(true);
    expect(templateFor("REPLACEMENT").tracksResult).toBe(false);
  });

  it("baris baru memakai judul bawaan jenisnya, yang tetap dapat diubah", () => {
    expect(blankEntry("REPLACEMENT").label).toBe("Replacement part");
  });

  it("jenis yang tidak dikenal jatuh ke template bebas, bukan melempar", () => {
    // @ts-expect-error — meniru data lama yang jenisnya sudah tidak ada.
    expect(templateFor("SUDAH_DIHAPUS").kind).toBe("OTHER");
  });
});

describe("temporaryActionEntrySchema", () => {
  it("menerima baris sortir yang lengkap dan mengubah angkanya jadi number", () => {
    const result = temporaryActionEntrySchema.safeParse(sortir);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalPcs).toBe(500);
      expect(result.data.okPcs).toBe(497);
    }
  });

  it("membiarkan angka kosong tetap kosong, bukan menjadikannya nol", () => {
    // Nol berarti "disortir, tidak ada", sedangkan kosong berarti "belum dihitung".
    const result = temporaryActionEntrySchema.safeParse({
      kind: "REPLACEMENT",
      label: "Replacement part",
      totalPcs: "",
      totalBags: "",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalPcs).toBeUndefined();
      expect(result.data.totalBags).toBeUndefined();
    }
  });

  it("menolak hasil sortir yang melebihi jumlah yang disortir", () => {
    const result = temporaryActionEntrySchema.safeParse({
      ...sortir,
      totalPcs: "500",
      okPcs: "498",
      ngPcs: "5",
    });

    expect(errorsFor(result, "okPcs")).toHaveLength(1);
  });

  it("mengizinkan sortir yang belum selesai — OK + NG boleh kurang dari total", () => {
    const result = temporaryActionEntrySchema.safeParse({
      ...sortir,
      totalPcs: "500",
      okPcs: "200",
      ngPcs: "1",
    });

    expect(result.success).toBe(true);
  });

  it("menolak angka negatif dan pecahan", () => {
    expect(temporaryActionEntrySchema.safeParse({ ...sortir, totalPcs: "-1" }).success).toBe(false);
    expect(temporaryActionEntrySchema.safeParse({ ...sortir, totalPcs: "2.5" }).success).toBe(false);
  });

  it("mewajibkan judul", () => {
    expect(errorsFor(temporaryActionEntrySchema.safeParse({ ...sortir, label: "  " }), "label"))
      .toHaveLength(1);
  });
});

describe("temporaryActionSchema", () => {
  it("menerima tabel kosong — section boleh belum diisi", () => {
    const result = temporaryActionSchema.safeParse({ entries: [] });

    expect(result.success).toBe(true);
  });

  it("membatasi jumlah baris", () => {
    const entries = Array.from({ length: 21 }, () => sortir);

    expect(temporaryActionSchema.safeParse({ entries }).success).toBe(false);
  });
});

describe("readTemporaryAction", () => {
  it("mengembalikan tabel kosong untuk kolom Json yang belum pernah diisi", () => {
    expect(readTemporaryAction(null).entries).toEqual([]);
    expect(readTemporaryAction(undefined).entries).toEqual([]);
  });

  it("melewati baris yang bentuknya tidak dikenal, bukan membuang seluruhnya", () => {
    // Satu baris rusak tidak boleh menjatuhkan halaman CPAR.
    const value = readTemporaryAction({
      entries: [sortir, { kind: "ENTAH", label: 42 }, { ...sortir, label: "Gelombang kedua" }],
    });

    expect(value.entries.map((entry) => entry.label)).toEqual([
      "Selection stock customer",
      "Gelombang kedua",
    ]);
  });

  it("mengenali tabel yang berisi dan yang kosong", () => {
    expect(hasTemporaryAction({ entries: [sortir] })).toBe(true);
    expect(hasTemporaryAction({ entries: [] })).toBe(false);
    expect(hasTemporaryAction("bukan objek")).toBe(false);
  });
});

describe("kelengkapan section", () => {
  it("menganggap temporary action terisi dari tabelnya walau paragrafnya kosong", () => {
    expect(
      isSectionFilled({ key: "TEMPORARY_ACTION", content: null, data: { entries: [sortir] } }),
    ).toBe(true);
  });

  it("menganggapnya kosong bila tabelnya tidak punya baris", () => {
    expect(
      isSectionFilled({ key: "TEMPORARY_ACTION", content: null, data: { entries: [] } }),
    ).toBe(false);
  });

  it("tidak menuntut temporary action saat submit bila tabelnya sudah berisi", () => {
    const sections = [
      { key: "TEMPORARY_ACTION" as const, content: null, isRequired: true, data: { entries: [sortir] } },
      { key: "ROOT_CAUSE_OUTFLOW" as const, content: null, isRequired: true },
    ];

    expect(missingRequiredSections(sections)).toEqual(["ROOT_CAUSE_OUTFLOW"]);
  });
});
