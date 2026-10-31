import { describe, expect, it } from "vitest";

import { STRUCTURED_SECTIONS, isSectionFilled } from "@/lib/cpar";
import {
  COUNTERMEASURE_ITEM_MAX,
  blankItem,
  countermeasureItemSchema,
  countermeasureSchema,
  hasCountermeasure,
  itemIds,
  readCountermeasure,
  withoutDate,
} from "@/schemas/countermeasure";

/**
 * Perbaikan tetap adalah satu-satunya section yang menugaskan orang pada tanggal
 * tertentu, dan evidence-nya menempel pada penanda baris. Dua hal itu yang diuji di
 * sini: apa yang wajib ada pada sebuah tindakan, dan apa yang terjadi pada penandanya.
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

describe("countermeasureItemSchema", () => {
  it("menerima tindakan yang lengkap", () => {
    expect(countermeasureItemSchema.safeParse(seal).success).toBe(true);
  });

  it("mewajibkan tindakan dan PIC", () => {
    expect(errorsFor(countermeasureItemSchema.safeParse({ ...seal, action: "  " }), "action"))
      .toHaveLength(1);
    expect(errorsFor(countermeasureItemSchema.safeParse({ ...seal, picId: "" }), "picId"))
      .toHaveLength(1);
  });

  it("membolehkan tanggal implementasi kosong — rencana sering ditulis sebelum disepakati", () => {
    const result = countermeasureItemSchema.safeParse(inspeksi);

    expect(result.success).toBe(true);
    expect(result.success ? result.data.implementedOn : "x").toBeUndefined();
  });

  it("menolak tanggal yang tidak berbentuk YYYY-MM-DD", () => {
    expect(
      errorsFor(
        countermeasureItemSchema.safeParse({ ...seal, implementedOn: "14 Nov 2026" }),
        "implementedOn",
      ),
    ).toContain("Tanggal belum lengkap.");
    expect(countermeasureItemSchema.safeParse({ ...seal, implementedOn: "2026-13-01" }).success)
      .toBe(false);
  });

  it("menolak penanda baris yang bukan uuid", () => {
    // Penanda menentukan evidence milik siapa; bentuk bebas membuka jalan menunjuk
    // baris milik klaim lain.
    expect(countermeasureItemSchema.safeParse({ ...seal, id: "baris-1" }).success).toBe(false);
  });

  it("baris baru belum punya penanda — server yang memberikannya saat disimpan", () => {
    const item = blankItem();

    expect(item.id).toBeUndefined();
    expect(item.action).toBe("");
    expect(item.picId).toBe("");
  });
});

describe("countermeasureSchema", () => {
  it("membatasi jumlah tindakan", () => {
    const items = Array.from({ length: COUNTERMEASURE_ITEM_MAX + 1 }, () => inspeksi);

    expect(countermeasureSchema.safeParse({ items }).success).toBe(false);
  });

  it("menerima daftar yang masih kosong", () => {
    expect(countermeasureSchema.safeParse({ items: [] }).success).toBe(true);
  });
});

describe("readCountermeasure", () => {
  it("mengembalikan daftar kosong untuk kolom yang belum pernah diisi", () => {
    expect(readCountermeasure(null).items).toEqual([]);
    expect(readCountermeasure("bukan objek").items).toEqual([]);
  });

  it("melewati baris yang rusak, bukan membuang seluruhnya", () => {
    const value = readCountermeasure({ items: [seal, { action: 42 }, inspeksi] });

    expect(value.items.map((item) => item.picId)).toEqual(["user-bambang", "user-yusuf"]);
  });

  it("hanya baris yang sudah tersimpan punya penanda", () => {
    const value = readCountermeasure({ items: [seal, inspeksi] });

    expect(itemIds(value)).toEqual([seal.id]);
  });

  it("menghitung tindakan yang belum punya tanggal implementasi", () => {
    expect(withoutDate(readCountermeasure({ items: [seal, inspeksi] }))).toBe(1);
    expect(withoutDate(readCountermeasure({ items: [seal] }))).toBe(0);
  });
});

describe("kelengkapan section", () => {
  it("perbaikan tetap diperlakukan sebagai section tabel", () => {
    expect(STRUCTURED_SECTIONS as readonly string[]).toContain("PERMANENT_COUNTERMEASURE");
  });

  it("terisi begitu ada satu tindakan yang ditulis", () => {
    expect(hasCountermeasure({ items: [inspeksi] })).toBe(true);
    expect(hasCountermeasure({ items: [] })).toBe(false);
  });

  it("tidak menuntut tanggal implementasi untuk dianggap terisi", () => {
    // Rencana perbaikan sering disepakati tanggalnya belakangan; menahan submit
    // karenanya hanya akan menghasilkan tanggal karangan.
    expect(
      isSectionFilled({
        key: "PERMANENT_COUNTERMEASURE",
        content: null,
        data: { items: [inspeksi] },
      }),
    ).toBe(true);
  });

  it("paragraf saja tidak membuat section ini terisi", () => {
    expect(
      isSectionFilled({
        key: "PERMANENT_COUNTERMEASURE",
        content: "Seal diganti dan jadwal perawatan diperbarui.",
        data: null,
      }),
    ).toBe(false);
  });
});
