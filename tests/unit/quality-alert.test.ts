import { describe, expect, it } from "vitest";

import { periodLabel, splitQty } from "@/lib/quality-alert";

describe("kolom PERIOD", () => {
  it("memakai singkatan bulan tiga huruf seperti pada formulir", () => {
    expect(periodLabel(new Date("2026-10-18T03:00:00Z"))).toEqual({ month: "OCT", year: "2026" });
    expect(periodLabel(new Date("2026-01-05T03:00:00Z")).month).toBe("JAN");
    expect(periodLabel(new Date("2026-12-31T03:00:00Z")).month).toBe("DEC");
  });
});

describe("kolom QTY", () => {
  it("mengisi sel yang cocok dengan satuannya saja", () => {
    expect(splitQty(46, "PCS")).toEqual({ pcs: "46", box: null });
    expect(splitQty(3, "BOX")).toEqual({ pcs: null, box: "3" });
  });

  it("mengosongkan keduanya saat qty belum diisi", () => {
    // Draft memulai qty pada nol; nol bukan jumlah, melainkan belum terisi.
    expect(splitQty(0, "PCS")).toEqual({ pcs: null, box: null });
    expect(splitQty(null, "PCS")).toEqual({ pcs: null, box: null });
    expect(splitQty(undefined, undefined)).toEqual({ pcs: null, box: null });
  });

  it("tidak mengisi sel apa pun saat satuannya tidak dikenal", () => {
    expect(splitQty(12, null)).toEqual({ pcs: null, box: null });
  });

  it("menolak angka yang tidak masuk akal alih-alih mencetaknya", () => {
    expect(splitQty(Number.NaN, "PCS")).toEqual({ pcs: null, box: null });
    expect(splitQty(-5, "PCS")).toEqual({ pcs: null, box: null });
  });
});
