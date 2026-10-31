import { describe, expect, it } from "vitest";

import { STRUCTURED_SECTIONS, isSectionFilled } from "@/lib/cpar";
import {
  FISHBONE_CATEGORIES,
  JUDGEMENTS,
  ROOT_CAUSE_FACTOR_MAX,
  WHY_DEPTH,
  blankFactor,
  countNg,
  factorsWithWhys,
  filledWhys,
  groupByCategory,
  hasRootCause,
  readRootCause,
  rootCauseFactorSchema,
  rootCauseSchema,
  rootOf,
} from "@/schemas/root-cause";

function errorsFor(
  result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } },
  field: string,
) {
  if (result.success || !result.error) return [];

  return result.error.issues
    .filter((issue) => issue.path.map(String).join(".") === field)
    .map((issue) => issue.message);
}

const tekanan = {
  category: "MACHINE",
  item: "Setting tekanan holding",
  controlPoint: "WI-PRD-014: 48–52 MPa",
  actual: "Terukur 42 MPa pada mesin 4",
  judgement: "NG",
};

const operator = {
  category: "MAN",
  item: "Kepatuhan pemeriksaan awal shift",
  controlPoint: "Checklist dijalankan tiap awal shift",
  actual: "Terisi lengkap",
  judgement: "OK",
};

describe("aspek 4M1E", () => {
  it("mencakup kelima aspek yang diminta", () => {
    expect(FISHBONE_CATEGORIES).toEqual(["MAN", "MACHINE", "METHOD", "MATERIAL", "ENVIRONMENT"]);
  });

  it("menyediakan ketiga judgement, termasuk OK but need improvement", () => {
    expect(JUDGEMENTS).toEqual(["OK", "NG", "OK_NEED_IMPROVEMENT"]);
  });

  it("baris baru dimulai dari kategori yang dipilih dengan judgement OK", () => {
    const factor = blankFactor("ENVIRONMENT");

    expect(factor.category).toBe("ENVIRONMENT");
    expect(factor.judgement).toBe("OK");
  });
});

describe("rootCauseFactorSchema", () => {
  it("menerima faktor yang lengkap", () => {
    expect(rootCauseFactorSchema.safeParse(tekanan).success).toBe(true);
  });

  it("mewajibkan item yang diperiksa", () => {
    expect(errorsFor(rootCauseFactorSchema.safeParse({ ...tekanan, item: "  " }), "item"))
      .toHaveLength(1);
  });

  it("membolehkan control point dan kondisi aktual kosong saat analisis masih berjalan", () => {
    const result = rootCauseFactorSchema.safeParse({
      category: "METHOD",
      item: "Urutan inspeksi",
      judgement: "OK",
    });

    expect(result.success).toBe(true);
  });

  it("menolak kategori dan judgement yang tidak dikenal", () => {
    expect(rootCauseFactorSchema.safeParse({ ...tekanan, category: "MONEY" }).success).toBe(false);
    expect(rootCauseFactorSchema.safeParse({ ...tekanan, judgement: "MUNGKIN" }).success).toBe(false);
  });
});

describe("analisis 5 Why", () => {
  const whys = [
    "Tekanan holding turun di bawah standar",
    "Regulator bocor",
    "Seal regulator tidak pernah diganti",
    "Seal tidak masuk daftar perawatan berkala",
  ];

  it("rantai menempel pada faktornya, sedalam-dalamnya lima tingkat", () => {
    expect(WHY_DEPTH).toBe(5);
    expect(rootCauseFactorSchema.safeParse({ ...tekanan, whys }).success).toBe(true);
    expect(
      rootCauseFactorSchema.safeParse({ ...tekanan, whys: [...whys, "a", "b"] }).success,
    ).toBe(false);
  });

  it("faktor tanpa rantai tetap sah — tidak semua faktor perlu ditelusuri", () => {
    const result = rootCauseFactorSchema.safeParse(operator);

    expect(result.success).toBe(true);
    expect(result.success ? result.data.whys : null).toEqual([]);
    expect(blankFactor("MAN").whys).toEqual([]);
  });

  it("menolak rantai yang berlubang", () => {
    // "Why 3" terisi sementara "Why 2" kosong memutus sebab-akibatnya: pembacanya tidak
    // dapat tahu apa yang hilang di antaranya.
    const result = rootCauseFactorSchema.safeParse({
      ...tekanan,
      whys: ["Tekanan turun", "", "Seal bocor"],
    });

    expect(result.success).toBe(false);
    expect(errorsFor(result, "whys.1")).toHaveLength(1);
  });

  it("berhenti lebih awal diperbolehkan — ekor kosong bukan lubang", () => {
    const result = rootCauseFactorSchema.safeParse({
      ...tekanan,
      whys: ["Tekanan turun", "Regulator bocor", "", ""],
    });

    expect(result.success).toBe(true);
    expect(result.success ? filledWhys(result.data) : null).toEqual([
      "Tekanan turun",
      "Regulator bocor",
    ]);
  });

  it("jawaban terdalam adalah akar yang ditemukan, bukan selalu tingkat kelima", () => {
    const value = readRootCause({ factors: [{ ...tekanan, whys }, operator] });

    expect(rootOf(value.factors[0])).toBe("Seal tidak masuk daftar perawatan berkala");
    expect(rootOf(value.factors[1])).toBeNull();
  });

  it("hanya faktor yang punya rantai yang ditampilkan sebagai 5 Why", () => {
    const value = readRootCause({ factors: [operator, { ...tekanan, whys }] });

    expect(factorsWithWhys(value).map((factor) => factor.item)).toEqual([
      "Setting tekanan holding",
    ]);
  });

  it("rantai lama tetap terbaca kembali dari kolom Json", () => {
    const value = readRootCause({ factors: [{ ...tekanan, whys }] });

    expect(value.factors[0].whys).toEqual(whys);
  });
});

describe("rootCauseSchema", () => {
  it("membatasi jumlah faktor", () => {
    const factors = Array.from({ length: ROOT_CAUSE_FACTOR_MAX + 1 }, () => tekanan);

    expect(rootCauseSchema.safeParse({ factors }).success).toBe(false);
  });

  it("menerima analisis yang belum punya faktor", () => {
    expect(rootCauseSchema.safeParse({ factors: [] }).success).toBe(true);
  });
});

describe("groupByCategory", () => {
  it("mengelompokkan faktor menurut kelima tulang, dalam urutan tetap", () => {
    const value = readRootCause({ factors: [tekanan, operator] });
    const groups = groupByCategory(value);

    expect(groups.map((group) => group.category)).toEqual([...FISHBONE_CATEGORIES]);
    expect(groups[0].factors).toHaveLength(1); // MAN
    expect(groups[1].factors).toHaveLength(1); // MACHINE
    expect(groups[2].factors).toHaveLength(0); // METHOD
  });

  it("tetap mengembalikan kelima tulang walau sebagian kosong", () => {
    expect(groupByCategory(readRootCause({ factors: [] }))).toHaveLength(5);
  });
});

describe("readRootCause", () => {
  it("mengembalikan analisis kosong untuk kolom yang belum pernah diisi", () => {
    expect(readRootCause(null).factors).toEqual([]);
    expect(readRootCause("bukan objek").factors).toEqual([]);
  });

  it("melewati faktor yang rusak, bukan membuang seluruhnya", () => {
    const value = readRootCause({ factors: [tekanan, { item: 42 }, operator] });

    expect(value.factors.map((factor) => factor.item)).toEqual([
      "Setting tekanan holding",
      "Kepatuhan pemeriksaan awal shift",
    ]);
  });

  it("menghitung faktor yang dinilai NG", () => {
    expect(countNg(readRootCause({ factors: [tekanan, operator] }))).toBe(1);
    expect(countNg(readRootCause({ factors: [operator] }))).toBe(0);
  });
});

describe("kelengkapan section", () => {
  it("kedua sisi analisis diperlakukan sebagai section tabel", () => {
    const structured = STRUCTURED_SECTIONS as readonly string[];

    expect(structured).toContain("ROOT_CAUSE_OCCURRENCE");
    expect(structured).toContain("ROOT_CAUSE_OUTFLOW");
  });

  it("terisi begitu ada satu faktor yang diperiksa", () => {
    for (const key of ["ROOT_CAUSE_OCCURRENCE", "ROOT_CAUSE_OUTFLOW"] as const) {
      expect(isSectionFilled({ key, content: null, data: { factors: [operator] } })).toBe(true);
      expect(isSectionFilled({ key, content: null, data: { factors: [] } })).toBe(false);
    }
  });

  it("tidak menuntut adanya faktor NG", () => {
    // Analisis yang jujur dapat menyimpulkan satu sisi memang sesuai standar, dan akar
    // masalahnya ada di sisi lain. Menahan submit karenanya akan memaksa NG yang palsu.
    expect(hasRootCause({ factors: [operator] })).toBe(true);
  });

  it("paragraf saja tidak membuat section ini terisi", () => {
    expect(
      isSectionFilled({
        key: "ROOT_CAUSE_OCCURRENCE",
        content: "Tekanan holding turun.",
        data: null,
      }),
    ).toBe(false);
  });
});
