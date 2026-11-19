import { describe, expect, it } from "vitest";

import type { CparStatus } from "@/generated/prisma/enums";
import {
  CPAR_STAGE_LABEL,
  CPAR_STAGE_ORDER,
  claimStatusFor,
  leadCpar,
  leastAdvancedStage,
} from "@/lib/cpar-stage";

/**
 * Status klaim sebagai turunan dari seluruh CPAR-nya.
 *
 * Inti perubahan "beberapa CPAR per klaim" ada di sini. Sebelumnya tahap CPAR **adalah**
 * status klaim, dan sebelas tempat menulisnya langsung. Dengan dua CPAR hal itu runtuh:
 * yang terakhir menyimpan yang menang, dan klaim terbaca "approved" padahal ada CPAR yang
 * belum tersentuh.
 */

const ALL: CparStatus[] = [
  "ISSUED",
  "IN_PROGRESS",
  "UNDER_VERIFICATION",
  "REVISION",
  "APPROVED",
  "MONITORING",
  "CLOSED",
];

describe("urutan tahap", () => {
  it("memberi peringkat kepada setiap tahap, tanpa seri", () => {
    const ranks = ALL.map((stage) => CPAR_STAGE_ORDER[stage]);

    expect(new Set(ranks).size).toBe(ALL.length);
  });

  it("menempatkan REVISION di bawah UNDER_VERIFICATION, bukan di atasnya", () => {
    /*
     * Meski terjadi sesudahnya secara kronologi. CPAR yang dikembalikan untuk revisi
     * kembali menjadi pekerjaan yang belum selesai; mengurutkannya menurut waktu akan
     * membuat klaim yang CPAR-nya ditolak terbaca lebih maju daripada klaim yang
     * CPAR-nya sedang diperiksa dengan tenang.
     */
    expect(CPAR_STAGE_ORDER.REVISION).toBeLessThan(CPAR_STAGE_ORDER.UNDER_VERIFICATION);
    expect(CPAR_STAGE_ORDER.IN_PROGRESS).toBeLessThan(CPAR_STAGE_ORDER.REVISION);
  });

  it("memberi label kepada setiap tahap", () => {
    for (const stage of ALL) {
      expect(CPAR_STAGE_LABEL[stage], stage).toBeTruthy();
    }
  });
});

describe("tahap paling tertinggal", () => {
  it("tidak menjawab apa pun bila klaim belum punya CPAR", () => {
    // Klaim seperti itu masih DRAFT, PUBLISHED, atau IGNORED — dan statusnya bukan
    // urusan fungsi ini.
    expect(leastAdvancedStage([])).toBeNull();
    expect(claimStatusFor([])).toBeNull();
  });

  it("mengikuti satu-satunya CPAR bila memang hanya ada satu", () => {
    for (const stage of ALL) {
      expect(leastAdvancedStage([stage]), stage).toBe(stage);
    }
  });

  it("memilih yang paling tertinggal, bukan yang paling maju", () => {
    expect(leastAdvancedStage(["CLOSED", "IN_PROGRESS"])).toBe("IN_PROGRESS");
    expect(leastAdvancedStage(["APPROVED", "MONITORING", "ISSUED"])).toBe("ISSUED");
  });

  it("tidak terpengaruh urutan masukan", () => {
    expect(leastAdvancedStage(["IN_PROGRESS", "CLOSED"])).toBe("IN_PROGRESS");
    expect(leastAdvancedStage(["CLOSED", "IN_PROGRESS"])).toBe("IN_PROGRESS");
  });
});

describe("status klaim turunan", () => {
  it("memetakan tiap tahap ke satu status klaim", () => {
    expect(claimStatusFor(["ISSUED"])).toBe("CPAR_ISSUED");
    expect(claimStatusFor(["IN_PROGRESS"])).toBe("CPAR_IN_PROGRESS");
    expect(claimStatusFor(["UNDER_VERIFICATION"])).toBe("CPAR_UNDER_VERIFICATION");
    expect(claimStatusFor(["REVISION"])).toBe("CPAR_REVISION");
    expect(claimStatusFor(["APPROVED"])).toBe("CPAR_APPROVED");
    expect(claimStatusFor(["MONITORING"])).toBe("CAPA_MONITORING");
    expect(claimStatusFor(["CLOSED"])).toBe("VERIFIED_CLOSED");
  });

  it("menutup klaim hanya ketika seluruh CPAR-nya tertutup", () => {
    // Inilah sifat yang paling mahal bila salah: klaim yang tertutup berhenti muncul
    // di daftar pekerjaan, dan CPAR kedua yang masih berjalan akan terlupakan.
    expect(claimStatusFor(["CLOSED", "CLOSED"])).toBe("VERIFIED_CLOSED");
    expect(claimStatusFor(["CLOSED", "MONITORING"])).toBe("CAPA_MONITORING");
    expect(claimStatusFor(["CLOSED", "ISSUED"])).toBe("CPAR_ISSUED");
  });

  it("menarik klaim kembali berjalan ketika CPAR baru diterbitkan atasnya", () => {
    // CPAR baru pada klaim yang sudah tertutup lahir sebagai ISSUED, dan klaimnya ikut
    // kembali ke tahap itu tanpa ada yang perlu menyetelnya.
    expect(claimStatusFor(["CLOSED", "ISSUED"])).toBe("CPAR_ISSUED");
  });

  it("mengembalikan klaim ke revisi begitu satu CPAR diminta diperbaiki", () => {
    expect(claimStatusFor(["APPROVED", "REVISION"])).toBe("CPAR_REVISION");
  });
});

describe("CPAR yang mewakili klaim pada tampilan sempit", () => {
  const cpar = (id: string, status: CparStatus) => ({ id, status });

  it("tidak memilih apa pun dari daftar kosong", () => {
    expect(leadCpar([])).toBeNull();
  });

  it("memilih CPAR yang paling tertinggal", () => {
    const chosen = leadCpar([cpar("a", "CLOSED"), cpar("b", "IN_PROGRESS")]);

    expect(chosen?.id).toBe("b");
  });

  it("sejalan dengan status klaim yang diturunkan dari daftar yang sama", () => {
    // Kepala halaman dan badge status harus bercerita tentang CPAR yang sama; bila
    // keduanya memilih berbeda, tenggat yang tampil milik CPAR lain daripada statusnya.
    const cpars = [cpar("a", "MONITORING"), cpar("b", "REVISION"), cpar("c", "CLOSED")];
    const chosen = leadCpar(cpars);

    expect(claimStatusFor(cpars.map((entry) => entry.status))).toBe("CPAR_REVISION");
    expect(chosen?.status).toBe("REVISION");
  });
});
