import { describe, expect, it } from "vitest";

import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  PAGE_SIZES,
  SEARCH_MAX,
  SORT_KEYS,
  claimFilterWhere,
  claimOrderBy,
  claimQueryString,
  hasActiveFilter,
  pageRange,
  parseClaimQuery,
} from "@/lib/claim-filters";

/**
 * Penyaring daftar klaim dibaca dari alamat halaman, dan alamat halaman datang dari
 * tautan yang bisa salah ketik, basi, atau dirangkai orang. Yang diuji di sini adalah
 * janji bahwa tidak satu pun dari ketiganya dapat menjatuhkan daftarnya — dan bahwa
 * tautan yang dihasilkan tetap menggambarkan tampilan yang sama.
 */

describe("parseClaimQuery", () => {
  it("memberi bawaan untuk alamat tanpa parameter apa pun", () => {
    const query = parseClaimQuery({});

    expect(query).toMatchObject({
      q: "",
      status: null,
      type: null,
      customerId: null,
      from: null,
      to: null,
      sort: DEFAULT_SORT,
      perPage: DEFAULT_PAGE_SIZE,
      page: 1,
    });
  });

  it("membaca penyaring yang dikenal", () => {
    const query = parseClaimQuery({
      q: "  clip  ",
      status: "PUBLISHED",
      type: "OFFICIAL",
      customer: "cus-1",
      from: "2026-10-01",
      to: "2026-10-31",
      sort: "part-asc",
      per: "50",
      page: "3",
    });

    expect(query).toEqual({
      q: "clip",
      status: "PUBLISHED",
      type: "OFFICIAL",
      customerId: "cus-1",
      from: "2026-10-01",
      to: "2026-10-31",
      sort: "part-asc",
      perPage: 50,
      page: 3,
    });
  });

  it("mengabaikan nilai yang tidak dikenal alih-alih menjatuhkan halaman", () => {
    const query = parseClaimQuery({
      status: "DIHAPUS",
      type: "RAHASIA",
      sort: "harga-termurah",
      per: "1000",
      page: "-4",
      from: "kemarin",
      to: "2026-13-45",
    });

    expect(query.status).toBeNull();
    expect(query.type).toBeNull();
    expect(query.sort).toBe(DEFAULT_SORT);
    expect(query.perPage).toBe(DEFAULT_PAGE_SIZE);
    expect(query.page).toBe(1);
    expect(query.from).toBeNull();
    expect(query.to).toBeNull();
  });

  it("membetulkan rentang tanggal yang terbalik", () => {
    // Daftar kosong tidak memberi tahu orang bahwa ia menukar kedua tanggalnya.
    const query = parseClaimQuery({ from: "2026-10-31", to: "2026-10-01" });

    expect(query.from).toBe("2026-10-01");
    expect(query.to).toBe("2026-10-31");
  });

  it("memotong pencarian yang terlalu panjang", () => {
    expect(parseClaimQuery({ q: "a".repeat(500) }).q).toHaveLength(SEARCH_MAX);
  });

  it("memakai nilai pertama bila satu kunci dikirim dua kali", () => {
    expect(parseClaimQuery({ status: ["PUBLISHED", "DRAFT"] }).status).toBe("PUBLISHED");
  });

  it("hanya menyediakan tiga ukuran halaman yang diminta", () => {
    expect(PAGE_SIZES).toEqual([10, 25, 50]);
  });
});

describe("claimFilterWhere", () => {
  it("tidak menyaring apa pun ketika belum ada penyaring", () => {
    expect(claimFilterWhere(parseClaimQuery({}))).toEqual({});
    expect(hasActiveFilter(parseClaimQuery({}))).toBe(false);
  });

  it("mencari di nomor klaim, part, customer, dan nomor CPAR sekaligus", () => {
    const where = claimFilterWhere(parseClaimQuery({ q: "clip" }));
    const or = (where.AND as { OR?: unknown[] }[])[0].OR ?? [];
    const fields = or.map((entry) => Object.keys(entry as object)[0]);

    expect(fields).toContain("claimNo");
    expect(fields).toContain("partName");
    expect(fields).toContain("internalPartNo");
    expect(fields).toContain("customerPartNo");
    expect(fields).toContain("customer");
    expect(fields).toContain("cpar");
  });

  it("mencari tanpa membedakan huruf besar kecil", () => {
    const where = claimFilterWhere(parseClaimQuery({ q: "CLIP" }));
    const or = (where.AND as { OR?: Record<string, { mode?: string }>[] }[])[0].OR ?? [];

    expect(or[0].claimNo?.mode).toBe("insensitive");
  });

  it("menyaring rentang tanggal kejadian sampai akhir hari terakhirnya", () => {
    // Batas atas pada tengah malam akan membuang klaim yang terjadi siang hari pada
    // tanggal yang justru diminta.
    const where = claimFilterWhere(parseClaimQuery({ from: "2026-10-01", to: "2026-10-31" }));
    const range = (where.AND as { dateOfOccurrence?: { gte?: Date; lte?: Date } }[]).find(
      (entry) => entry.dateOfOccurrence,
    )?.dateOfOccurrence;

    expect(range?.gte?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(range?.lte?.toISOString()).toBe("2026-10-31T23:59:59.999Z");
  });

  it("menerima batas yang hanya satu sisi", () => {
    const where = claimFilterWhere(parseClaimQuery({ from: "2026-10-01" }));
    const range = (where.AND as { dateOfOccurrence?: { gte?: Date; lte?: Date } }[]).find(
      (entry) => entry.dateOfOccurrence,
    )?.dateOfOccurrence;

    expect(range?.gte).toBeInstanceOf(Date);
    expect(range?.lte).toBeUndefined();
  });

  it("menganggap satu penyaring saja sudah membuat daftar tersaring", () => {
    for (const params of [
      { q: "clip" },
      { status: "PUBLISHED" },
      { type: "OFFICIAL" },
      { customer: "cus-1" },
      { from: "2026-10-01" },
    ]) {
      expect(hasActiveFilter(parseClaimQuery(params)), JSON.stringify(params)).toBe(true);
    }

    // Urutan dan ukuran halaman mengubah tampilan, bukan isinya.
    expect(hasActiveFilter(parseClaimQuery({ sort: "part-asc", per: "50" }))).toBe(false);
  });
});

describe("claimOrderBy", () => {
  it("menyediakan urutan untuk tanggal, nomor klaim, part, customer, dan status", () => {
    expect(SORT_KEYS).toEqual([
      "date-desc",
      "date-asc",
      "claim-desc",
      "claim-asc",
      "part-asc",
      "customer-asc",
      "status-asc",
    ]);

    for (const key of SORT_KEYS) {
      expect(claimOrderBy(key).length, key).toBeGreaterThan(0);
    }
  });

  it("menaruh klaim tanpa tanggal di akhir, bukan di awal", () => {
    const [first] = claimOrderBy("date-desc") as { dateOfOccurrence?: { nulls?: string } }[];

    expect(first.dateOfOccurrence?.nulls).toBe("last");
  });
});

describe("claimQueryString", () => {
  it("tidak menuliskan nilai bawaan", () => {
    expect(claimQueryString(parseClaimQuery({}))).toBe("");
    expect(claimQueryString(parseClaimQuery({ sort: DEFAULT_SORT, per: "25", page: "1" }))).toBe("");
  });

  it("mempertahankan penyaring saat berpindah halaman", () => {
    const query = parseClaimQuery({ q: "clip", status: "PUBLISHED", per: "10" });
    const next = claimQueryString(query, { page: 2 });

    expect(next).toContain("q=clip");
    expect(next).toContain("status=PUBLISHED");
    expect(next).toContain("per=10");
    expect(next).toContain("page=2");
  });

  it("dapat dibaca kembali menjadi penyaring yang sama", () => {
    const query = parseClaimQuery({
      q: "clip",
      status: "CPAR_IN_PROGRESS",
      type: "OFFICIAL",
      customer: "cus-1",
      from: "2026-10-01",
      to: "2026-10-31",
      sort: "customer-asc",
      per: "50",
      page: "2",
    });

    const roundTrip = parseClaimQuery(
      Object.fromEntries(new URLSearchParams(claimQueryString(query))),
    );

    expect(roundTrip).toEqual(query);
  });
});

describe("pageRange", () => {
  it("menghitung nomor baris yang sedang ditampilkan", () => {
    const range = pageRange(83, parseClaimQuery({ per: "25", page: "2" }));

    expect(range).toMatchObject({ pageCount: 4, page: 2, skip: 25, firstRow: 26, lastRow: 50 });
  });

  it("menjepit halaman yang sudah tidak ada setelah penyaring dipersempit", () => {
    // Tanpa penjepitan, halaman 7 pada hasil yang tinggal satu halaman akan tampil
    // kosong — terbaca seperti "tidak ada hasil", padahal hasilnya ada di halaman 1.
    const range = pageRange(8, parseClaimQuery({ per: "25", page: "7" }));

    expect(range).toMatchObject({ pageCount: 1, page: 1, skip: 0, firstRow: 1, lastRow: 8 });
  });

  it("tetap menyebut satu halaman ketika hasilnya kosong", () => {
    const range = pageRange(0, parseClaimQuery({}));

    expect(range).toMatchObject({ pageCount: 1, page: 1, firstRow: 0, lastRow: 0 });
  });

  it("tidak melaporkan baris terakhir melebihi jumlah hasilnya", () => {
    expect(pageRange(12, parseClaimQuery({ per: "10", page: "2" })).lastRow).toBe(12);
  });
});
