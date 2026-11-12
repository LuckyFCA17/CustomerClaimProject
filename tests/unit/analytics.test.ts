import { describe, expect, it } from "vitest";

import { CLAIM_TYPE_LABEL, CLAIM_TYPE_ORDER, UNTYPED, totalOf, typeBreakdown } from "@/lib/analytics";
import { ClaimType } from "@/generated/prisma/enums";

/**
 * Perhitungan grafik jenis klaim (§7).
 *
 * Yang diuji terutama dua hal yang mudah luput dan berakibat pada bacaan orang:
 * urutannya tetap walau angkanya berubah, dan jenis yang nol tetap digambar.
 */

describe("typeBreakdown", () => {
  it("menjaga urutan tetap, bukan urutan menurut jumlah", () => {
    // Warna mengikuti jenisnya, bukan peringkatnya. Mengurutkan menurut jumlah membuat
    // warna berpindah tiap kali datanya berubah, dan pembaca yang membandingkan dua
    // periode akan mengira jenis klaimnya yang bertukar.
    const rows = typeBreakdown({ INFORMATION_ONLY: 90, OFFICIAL: 1, NON_OFFICIAL: 50 });

    expect(rows.map((row) => row.type)).toEqual([...CLAIM_TYPE_ORDER]);
  });

  it("tetap menggambar jenis yang tidak punya klaim", () => {
    // Menghilangkannya membuat grafik dua batang terbaca seolah portal hanya mengenal
    // dua jenis klaim — padahal yang ketiga memang nol, dan itu sendiri sebuah temuan.
    const rows = typeBreakdown({ OFFICIAL: 3 });

    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.type === "NON_OFFICIAL")).toMatchObject({ count: 0, share: 0 });
  });

  it("menghitung porsi terhadap total, bukan terhadap jenis terbanyak", () => {
    const rows = typeBreakdown({ OFFICIAL: 3, NON_OFFICIAL: 1 });

    expect(rows[0]?.share).toBeCloseTo(0.75);
    expect(rows[1]?.share).toBeCloseTo(0.25);
  });

  it("tidak membagi dengan nol saat belum ada klaim sama sekali", () => {
    const rows = typeBreakdown({});

    expect(totalOf(rows)).toBe(0);
    expect(rows.every((row) => row.share === 0)).toBe(true);
  });

  it("porsinya selalu berjumlah satu selama ada isinya", () => {
    const rows = typeBreakdown({ OFFICIAL: 7, NON_OFFICIAL: 11, INFORMATION_ONLY: 2 });

    expect(rows.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(1);
    expect(totalOf(rows)).toBe(20);
  });
});

describe("integritas label", () => {
  it("menamai setiap jenis klaim yang dikenal Prisma", () => {
    // Jenis baru di skema tanpa label di sini akan tampil sebagai kode mentah pada
    // grafik dan pada berkas ekspor sekaligus — keduanya membaca peta yang sama.
    expect(Object.keys(CLAIM_TYPE_LABEL).sort()).toEqual(Object.values(ClaimType).sort());
  });

  it("urutan tampilnya memuat seluruh jenis, tanpa kembar", () => {
    expect([...CLAIM_TYPE_ORDER].sort()).toEqual(Object.values(ClaimType).sort());
  });
});

describe("klaim yang jenisnya belum diisi", () => {
  it("muncul sebagai baris tersendiri, bukan dibuang", () => {
    // Dibuang, total grafik ini tidak cocok dengan grafik klaim bulanan di sebelahnya —
    // dan selisih tanpa penjelasan membuat seluruh halaman tidak dipercaya.
    const rows = typeBreakdown({ OFFICIAL: 9, NON_OFFICIAL: 1 }, 4);

    expect(rows).toHaveLength(4);
    expect(rows.at(-1)).toMatchObject({ type: UNTYPED, label: "Belum diisi", count: 4 });
    expect(totalOf(rows)).toBe(14);
  });

  it("ikut membagi porsinya, bukan dihitung di luar total", () => {
    const rows = typeBreakdown({ OFFICIAL: 3 }, 1);

    expect(rows[0]?.share).toBeCloseTo(0.75);
    expect(rows.at(-1)?.share).toBeCloseTo(0.25);
  });

  it("tidak menambah baris ketika semuanya sudah berjenis", () => {
    // Baris "belum diisi" bernilai nol hanya menambah baris yang tidak pernah berubah.
    expect(typeBreakdown({ OFFICIAL: 3 }, 0)).toHaveLength(3);
    expect(typeBreakdown({ OFFICIAL: 3 })).toHaveLength(3);
  });

  it("mengabaikan jumlah negatif yang mustahil", () => {
    expect(typeBreakdown({ OFFICIAL: 3 }, -5)).toHaveLength(3);
  });
});
