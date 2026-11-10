import { describe, expect, it } from "vitest";

import { DUE_SOON_DAYS, dueWarning } from "@/lib/due-date";

/**
 * Peringatan tenggat pada tabel klaim dan CPAR.
 *
 * Batasnya dihitung per tanggal kalender Jakarta, jadi yang diuji di sini terutama
 * pergantian harinya — titik ketika satu baris berpindah warna.
 */

// 06 Nov 2026 17.00 WIB = 10.00 UTC. Tenggat selalu disimpan di akhir jam kerja.
const DUE = new Date("2026-11-06T10:00:00Z");

/** Pukul 09.00 WIB pada tanggal yang diberikan. */
const pagi = (iso: string) => new Date(`${iso}T02:00:00Z`);

describe("dueWarning", () => {
  it("diam selama tenggatnya masih jauh", () => {
    // Peringatan hanya berarti kalau ia jarang; baris yang semuanya berwarna sama
    // saja tidak memberi tahu apa pun.
    expect(dueWarning(DUE, pagi("2026-11-01"), false)).toBeNull();
    expect(dueWarning(DUE, pagi("2026-11-03"), false)).toBeNull();
  });

  it("memperingatkan sejak dua hari sebelum tenggat", () => {
    expect(dueWarning(DUE, pagi("2026-11-04"), false)).toMatchObject({
      state: "DUE_SOON",
      daysLeft: 2,
      label: "H-2",
      tone: "pending",
    });

    expect(dueWarning(DUE, pagi("2026-11-05"), false)).toMatchObject({
      state: "DUE_SOON",
      daysLeft: 1,
      label: "H-1",
    });
  });

  it("menandai hari tenggatnya sendiri", () => {
    expect(dueWarning(DUE, pagi("2026-11-06"), false)).toMatchObject({
      state: "DUE_TODAY",
      daysLeft: 0,
      label: "jatuh tempo hari ini",
      tone: "danger",
    });
  });

  it("tetap menyebut hari tenggat walau jamnya sudah lewat", () => {
    // Pukul 20.00 WIB pada hari tenggatnya sudah melewati instant 17.00, tetapi
    // harinya belum berganti bagi orang yang masih mengerjakannya.
    const malam = new Date("2026-11-06T13:00:00Z");

    expect(dueWarning(DUE, malam, false)?.state).toBe("DUE_TODAY");
  });

  it("menghitung keterlambatan dalam hari", () => {
    expect(dueWarning(DUE, pagi("2026-11-07"), false)).toMatchObject({
      state: "OVERDUE",
      daysLeft: -1,
      label: "lewat 1 hari",
      tone: "danger",
    });

    expect(dueWarning(DUE, pagi("2026-11-16"), false)?.label).toBe("lewat 10 hari");
  });

  it("berhenti memperingatkan begitu pekerjaannya selesai", () => {
    // Tenggat yang sudah dipenuhi tidak boleh terus berteriak merah di daftar; yang
    // menarik setelah itu adalah ketepatan waktunya, dan itu urusan badge status.
    expect(dueWarning(DUE, pagi("2026-11-16"), true)).toBeNull();
    expect(dueWarning(DUE, pagi("2026-11-06"), true)).toBeNull();
  });

  it("tidak memperingatkan apa pun tanpa tenggat", () => {
    // Klaim yang CPAR-nya belum terbit memang belum punya tenggat.
    expect(dueWarning(null, pagi("2026-11-16"), false)).toBeNull();
    expect(dueWarning(undefined, pagi("2026-11-16"), false)).toBeNull();
  });

  it("ambangnya satu angka, bukan tersebar di beberapa tempat", () => {
    const first = new Date(DUE.getTime() - DUE_SOON_DAYS * 86_400_000);

    expect(dueWarning(DUE, first, false)?.state).toBe("DUE_SOON");
    expect(dueWarning(DUE, new Date(first.getTime() - 86_400_000), false)).toBeNull();
  });
});
