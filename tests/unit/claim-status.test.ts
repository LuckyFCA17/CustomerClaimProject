import { describe, expect, it } from "vitest";

import {
  CLAIM_STATUS_META,
  CLAIM_STATUSES,
  CLOSURE_META,
  closureTiming,
  RAIL_STAGES,
  STATUS_TONE_CLASS,
  statusMeta,
  type ClaimStatus,
} from "@/config/claim-status";

describe("claim status metadata", () => {
  it("mendefinisikan meta untuk setiap status, tanpa entri liar", () => {
    expect(Object.keys(CLAIM_STATUS_META).sort()).toEqual([...CLAIM_STATUSES].sort());
  });

  it("menempatkan setiap status pada tahap status rail yang valid", () => {
    for (const status of CLAIM_STATUSES) {
      const meta = statusMeta(status);
      expect(meta.stage, status).toBeGreaterThanOrEqual(0);
      expect(meta.stage, status).toBeLessThan(RAIL_STAGES.length);
    }
  });

  it("memakai tone yang punya kelas warna", () => {
    for (const status of CLAIM_STATUSES) {
      expect(STATUS_TONE_CLASS[statusMeta(status).tone], status).toBeTruthy();
    }
  });

  it("menandai tepat dua status terminal (§5)", () => {
    const terminal = CLAIM_STATUSES.filter((status) => statusMeta(status).terminal);
    expect(terminal).toEqual<ClaimStatus[]>(["IGNORED", "VERIFIED_CLOSED"]);
  });

  it("menandai status revisi sebagai langkah mundur agar rail menggambar garis balik", () => {
    const reverted = CLAIM_STATUSES.filter((status) => statusMeta(status).reverted);
    expect(reverted).toEqual<ClaimStatus[]>(["REVISION_REQUESTED", "CPAR_REVISION"]);
  });

  it("memberi label dan hint yang tidak kosong untuk setiap status", () => {
    for (const status of CLAIM_STATUSES) {
      const meta = statusMeta(status);
      expect(meta.label.length, status).toBeGreaterThan(0);
      expect(meta.hint.length, status).toBeGreaterThan(0);
    }
  });

  it("menaruh VERIFIED_CLOSED pada tahap terakhir rail", () => {
    expect(statusMeta("VERIFIED_CLOSED").stage).toBe(RAIL_STAGES.length - 1);
  });
});

/**
 * Ketepatan waktu penutupan pada dasbor CPAR.
 *
 * Diturunkan dari `closedAt` dan `dueDate`, bukan disimpan — jadi yang diuji di sini
 * adalah batasnya, dan batas itu memakai tanggal kalender Jakarta.
 */
describe("closureTiming", () => {
  // 06 Nov 2026 17.00 WIB = 10.00 UTC. Tenggat selalu disimpan di akhir jam kerja.
  const due = new Date("2026-11-06T10:00:00Z");

  it("menyebut penutupan sebelum hari tenggat tepat waktu", () => {
    expect(closureTiming(new Date("2026-11-03T02:00:00Z"), due)).toBe("ON_TIME");
  });

  it("menyebut penutupan pada hari tenggat tepat waktu, berapa pun jamnya", () => {
    // Pukul 20.00 WIB pada hari tenggatnya lewat dari instant 17.00 WIB, tetapi
    // tanggalnya sama — dan yang diminta aturan adalah tanggal.
    expect(closureTiming(new Date("2026-11-06T13:00:00Z"), due)).toBe("ON_TIME");

    // Menit pertama hari tenggat menurut kalender Jakarta: 05 Nov 17.00 UTC.
    expect(closureTiming(new Date("2026-11-05T17:00:00Z"), due)).toBe("ON_TIME");

    // Menit terakhir hari tenggat: 06 Nov 16.59 UTC.
    expect(closureTiming(new Date("2026-11-06T16:59:00Z"), due)).toBe("ON_TIME");
  });

  it("menyebut penutupan sehari sesudahnya terlambat", () => {
    // 07 Nov 00.05 WIB = 06 Nov 17.05 UTC — hari berikutnya menurut kalender Jakarta.
    expect(closureTiming(new Date("2026-11-06T17:05:00Z"), due)).toBe("OVERDUE");
    expect(closureTiming(new Date("2026-12-01T02:00:00Z"), due)).toBe("OVERDUE");
  });

  it("tidak menebak apa pun bila salah satu tanggalnya tidak ada", () => {
    // Pemanggil lalu menampilkan label status biasa; menebak salah satu dari keduanya
    // akan mencetak klaim sebagai tepat waktu padahal tidak ada yang tahu.
    expect(closureTiming(null, due)).toBeNull();
    expect(closureTiming(new Date("2026-11-03T02:00:00Z"), null)).toBeNull();
    expect(closureTiming(undefined, undefined)).toBeNull();
  });

  it("memberi label dan warna yang berbeda untuk keduanya", () => {
    expect(CLOSURE_META.ON_TIME.label).toBe("Closed under due date");
    expect(CLOSURE_META.OVERDUE.label).toBe("Closed overdue date");
    expect(CLOSURE_META.ON_TIME.tone).not.toBe(CLOSURE_META.OVERDUE.tone);
  });
});
