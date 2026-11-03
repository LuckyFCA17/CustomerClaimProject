import { describe, expect, it } from "vitest";

import { loginSchema } from "@/schemas/auth";

/**
 * Normalisasi email pada layar login.
 *
 * Diuji tersendiri karena kegagalannya tidak terbaca sebagai kegagalan validasi: Auth.js
 * memperlakukan masukan yang ditolak sama dengan kata sandi salah, sehingga pengguna
 * melihat "Email atau kata sandi salah" untuk alamat yang sebenarnya benar — dan tidak
 * ada petunjuk bahwa yang salah hanyalah sebuah spasi.
 */

const PASSWORD = "Nifco#2026";

describe("loginSchema", () => {
  it("menerima alamat yang bersih", () => {
    const parsed = loginSchema.parse({ email: "dimas.prayoga@nifco.co.id", password: PASSWORD });

    expect(parsed.email).toBe("dimas.prayoga@nifco.co.id");
  });

  it.each([
    ["spasi di akhir", "dimas.prayoga@nifco.co.id "],
    ["spasi di awal", " dimas.prayoga@nifco.co.id"],
    ["spasi di kedua ujung", "  dimas.prayoga@nifco.co.id  "],
    ["huruf besar", "Dimas.Prayoga@NIFCO.co.id"],
    ["huruf besar dan spasi", " Dimas.Prayoga@NIFCO.co.id "],
  ])("menormalkan %s — papan ketik ponsel rutin menambahkannya", (_label, input) => {
    const parsed = loginSchema.parse({ email: input, password: PASSWORD });

    expect(parsed.email).toBe("dimas.prayoga@nifco.co.id");
  });

  it("tetap menolak alamat yang memang bukan email", () => {
    expect(loginSchema.safeParse({ email: "bukan-email", password: PASSWORD }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "   ", password: PASSWORD }).success).toBe(false);
  });

  it("tidak memangkas kata sandi — spasi boleh menjadi bagian sandi yang sah", () => {
    const parsed = loginSchema.parse({ email: "a@b.co", password: "  rahasia  " });

    expect(parsed.password).toBe("  rahasia  ");
  });
});
