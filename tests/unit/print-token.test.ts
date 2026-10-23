import { describe, expect, it } from "vitest";

import { createPrintToken, verifyPrintToken } from "@/lib/print-token";

const SECRET = "rahasia-untuk-pengujian-saja-0123456789";
process.env.AUTH_SECRET = SECRET;

const NOW = Date.UTC(2026, 9, 23, 6, 0, 0);
const DOC = "bad-news";
const CLAIM = "cmvkl07fv000lsh7d7wa638ny";

describe("token halaman cetak", () => {
  it("menerima token yang baru dibuat untuk dokumen dan klaim yang sama", () => {
    const token = createPrintToken(DOC, CLAIM, NOW);

    expect(verifyPrintToken(token, DOC, CLAIM, NOW + 1000)).toBe(true);
  });

  it("menolak token milik dokumen lain pada klaim yang sama", () => {
    const token = createPrintToken(DOC, CLAIM, NOW);

    expect(verifyPrintToken(token, "quick-info", CLAIM, NOW + 1000)).toBe(false);
  });

  it("menolak token milik klaim lain", () => {
    const token = createPrintToken(DOC, CLAIM, NOW);

    expect(verifyPrintToken(token, DOC, "klaim-orang-lain", NOW + 1000)).toBe(false);
  });

  it("kedaluwarsa setelah dua menit", () => {
    const token = createPrintToken(DOC, CLAIM, NOW);

    expect(verifyPrintToken(token, DOC, CLAIM, NOW + 119_000)).toBe(true);
    expect(verifyPrintToken(token, DOC, CLAIM, NOW + 121_000)).toBe(false);
  });

  it("menolak tanda tangan yang diubah", () => {
    const token = createPrintToken(DOC, CLAIM, NOW);
    const [expiry, signature] = token.split(".");
    const tampered = `${expiry}.${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`;

    expect(verifyPrintToken(tampered, DOC, CLAIM, NOW + 1000)).toBe(false);
  });

  it("menolak masa berlaku yang diperpanjang tanpa menandatangani ulang", () => {
    const token = createPrintToken(DOC, CLAIM, NOW);
    const signature = token.split(".")[1];
    const extended = `${NOW + 86_400_000}.${signature}`;

    expect(verifyPrintToken(extended, DOC, CLAIM, NOW + 1000)).toBe(false);
  });

  it("menolak token yang bentuknya tidak karuan", () => {
    for (const bad of [null, "", "tanpa-titik", ".", "abc.def", `${NOW}.`]) {
      expect(verifyPrintToken(bad, DOC, CLAIM, NOW), JSON.stringify(bad)).toBe(false);
    }
  });
});
