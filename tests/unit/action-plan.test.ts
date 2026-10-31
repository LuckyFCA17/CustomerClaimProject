import { describe, expect, it } from "vitest";

import { ACTION_PLAN_SECTIONS, STRUCTURED_SECTIONS, isSectionFilled } from "@/lib/cpar";
import {
  ACTION_ITEM_MAX,
  actionItemSchema,
  actionPlanSchema,
  blankItem,
  hasActionPlan,
  itemIds,
  readActionPlan,
  withoutDate,
} from "@/schemas/action-plan";

/**
 * Dua section menugaskan orang pada tanggal tertentu — perbaikan tetap dan standardisasi
 * & penyebaran — dan evidence keduanya menempel pada penanda baris. Dua hal itu yang
 * diuji di sini: apa yang wajib ada pada sebuah baris, dan apa yang terjadi pada
 * penandanya.
 */

function errorsFor(
  result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } },
  field: string,
) {
  if (result.success || !result.error) return [];

  return result.error.issues
    .filter((issue) => issue.path.map(String).join(".") === field)
    .map((issue) => issue.message);
}

const seal = {
  id: "6f1c1a2e-6f2a-4f0e-9f1a-2b3c4d5e6f70",
  action: "Mengganti seal regulator mesin 4 dan memasukkannya ke jadwal perawatan jam operasi",
  picId: "user-bambang",
  implementedOn: "2026-11-14",
  note: "WI-PRD-014 rev. 3",
};

const inspeksi = {
  action: "Menambahkan kaki pengunci ke titik final inspection",
  picId: "user-yusuf",
};

describe("actionItemSchema", () => {
  it("menerima tindakan yang lengkap", () => {
    expect(actionItemSchema.safeParse(seal).success).toBe(true);
  });

  it("mewajibkan isian dan PIC", () => {
    expect(errorsFor(actionItemSchema.safeParse({ ...seal, action: "  " }), "action"))
      .toHaveLength(1);
    expect(errorsFor(actionItemSchema.safeParse({ ...seal, picId: "" }), "picId"))
      .toHaveLength(1);
  });

  it("membolehkan tanggal implementasi kosong — rencana sering ditulis sebelum disepakati", () => {
    const result = actionItemSchema.safeParse(inspeksi);

    expect(result.success).toBe(true);
    expect(result.success ? result.data.implementedOn : "x").toBeUndefined();
  });

  it("menolak tanggal yang tidak berbentuk YYYY-MM-DD", () => {
    expect(
      errorsFor(
        actionItemSchema.safeParse({ ...seal, implementedOn: "14 Nov 2026" }),
        "implementedOn",
      ),
    ).toContain("Tanggal belum lengkap.");
    expect(actionItemSchema.safeParse({ ...seal, implementedOn: "2026-13-01" }).success)
      .toBe(false);
  });

  it("menolak penanda baris yang bukan uuid", () => {
    // Penanda menentukan evidence milik siapa; bentuk bebas membuka jalan menunjuk
    // baris milik klaim lain.
    expect(actionItemSchema.safeParse({ ...seal, id: "baris-1" }).success).toBe(false);
  });

  it("baris baru belum punya penanda — server yang memberikannya saat disimpan", () => {
    const item = blankItem();

    expect(item.id).toBeUndefined();
    expect(item.action).toBe("");
    expect(item.picId).toBe("");
  });
});

describe("actionPlanSchema", () => {
  it("membatasi jumlah tindakan", () => {
    const items = Array.from({ length: ACTION_ITEM_MAX + 1 }, () => inspeksi);

    expect(actionPlanSchema.safeParse({ items }).success).toBe(false);
  });

  it("menerima daftar yang masih kosong", () => {
    expect(actionPlanSchema.safeParse({ items: [] }).success).toBe(true);
  });
});

describe("readActionPlan", () => {
  it("mengembalikan daftar kosong untuk kolom yang belum pernah diisi", () => {
    expect(readActionPlan(null).items).toEqual([]);
    expect(readActionPlan("bukan objek").items).toEqual([]);
  });

  it("melewati baris yang rusak, bukan membuang seluruhnya", () => {
    const value = readActionPlan({ items: [seal, { action: 42 }, inspeksi] });

    expect(value.items.map((item) => item.picId)).toEqual(["user-bambang", "user-yusuf"]);
  });

  it("hanya baris yang sudah tersimpan punya penanda", () => {
    const value = readActionPlan({ items: [seal, inspeksi] });

    expect(itemIds(value)).toEqual([seal.id]);
  });

  it("menghitung baris yang belum punya tanggal implementasi", () => {
    expect(withoutDate(readActionPlan({ items: [seal, inspeksi] }))).toBe(1);
    expect(withoutDate(readActionPlan({ items: [seal] }))).toBe(0);
  });
});

describe("kelengkapan section", () => {
  it("dipakai perbaikan tetap maupun standardisasi & penyebaran", () => {
    expect(ACTION_PLAN_SECTIONS).toEqual([
      "PERMANENT_COUNTERMEASURE",
      "STANDARDIZATION_HORIZONTAL",
    ]);

    for (const key of ACTION_PLAN_SECTIONS) {
      expect(STRUCTURED_SECTIONS as readonly string[], key).toContain(key);
    }
  });

  it("terisi begitu ada satu baris yang ditulis", () => {
    expect(hasActionPlan({ items: [inspeksi] })).toBe(true);
    expect(hasActionPlan({ items: [] })).toBe(false);
  });

  it("tidak menuntut tanggal implementasi untuk dianggap terisi", () => {
    // Rencana sering disepakati tanggalnya belakangan; menahan submit karenanya hanya
    // akan menghasilkan tanggal karangan.
    for (const key of ACTION_PLAN_SECTIONS) {
      expect(isSectionFilled({ key, content: null, data: { items: [inspeksi] } }), key).toBe(
        true,
      );
    }
  });

  it("paragraf saja tidak membuat kedua section ini terisi", () => {
    for (const key of ACTION_PLAN_SECTIONS) {
      expect(
        isSectionFilled({
          key,
          content: "Seal diganti dan jadwal perawatan diperbarui.",
          data: null,
        }),
        key,
      ).toBe(false);
    }
  });
});
