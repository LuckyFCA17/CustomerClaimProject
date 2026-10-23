import { describe, expect, it } from "vitest";

import {
  DEFAULT_CPAR_DUE_WORKING_DAYS,
  addWorkingDays,
  defaultCparDueDate,
  endOfWorkingDay,
  isWorkingDay,
  jakartaDayOfWeek,
  toJakartaDateInput,
} from "@/lib/dates";

/** Tanggal ditulis sebagai instan UTC; labelnya menyebut hari menurut kalender Jakarta. */
const SENIN = new Date("2026-10-19T03:00:00Z"); // Senin 19 Okt 2026, 10:00 WIB
const JUMAT = new Date("2026-10-23T03:00:00Z");
const SABTU = new Date("2026-10-24T03:00:00Z");
const MINGGU = new Date("2026-10-25T03:00:00Z");

describe("kalender Jakarta", () => {
  it("menghitung hari memakai zona Jakarta, bukan UTC", () => {
    // 23:00 WIB Jumat masih 16:00 UTC Jumat — keduanya Jumat.
    expect(jakartaDayOfWeek(new Date("2026-10-23T16:00:00Z"))).toBe(5);

    // 07:00 WIB Sabtu adalah 00:00 UTC Sabtu.
    expect(jakartaDayOfWeek(new Date("2026-10-24T00:00:00Z"))).toBe(6);

    // 06:00 WIB Sabtu masih 23:00 UTC Jumat — di Jakarta sudah Sabtu.
    expect(jakartaDayOfWeek(new Date("2026-10-23T23:00:00Z"))).toBe(6);
  });

  it("mengenali akhir pekan", () => {
    expect(isWorkingDay(SENIN)).toBe(true);
    expect(isWorkingDay(JUMAT)).toBe(true);
    expect(isWorkingDay(SABTU)).toBe(false);
    expect(isWorkingDay(MINGGU)).toBe(false);
  });

  it("menutup hari kerja pada 17:00 WIB", () => {
    const end = endOfWorkingDay(SENIN);

    // 17:00 WIB = 10:00 UTC pada hari yang sama.
    expect(end.toISOString()).toBe("2026-10-19T10:00:00.000Z");
  });

  it("memberi nilai input tanggal menurut kalender Jakarta", () => {
    expect(toJakartaDateInput(new Date("2026-10-23T16:00:00Z"))).toBe("2026-10-23");

    // Lewat tengah malam WIB walau di UTC masih tanggal 23.
    expect(toJakartaDateInput(new Date("2026-10-23T23:00:00Z"))).toBe("2026-10-24");
  });
});

describe("penambahan hari kerja", () => {
  it("menambah hari biasa di tengah pekan", () => {
    // Senin + 3 hari kerja = Kamis.
    expect(toJakartaDateInput(addWorkingDays(SENIN, 3))).toBe("2026-10-22");
  });

  it("melompati akhir pekan", () => {
    // Kamis 22 Okt + 3 hari kerja = Selasa 27 Okt, bukan Minggu 25 Okt.
    const kamis = new Date("2026-10-22T03:00:00Z");
    expect(toJakartaDateInput(addWorkingDays(kamis, 3))).toBe("2026-10-27");
  });

  it("memindahkan titik awal akhir pekan ke hari kerja berikutnya", () => {
    // Sabtu + 0 hari kerja tetap harus mendarat di Senin.
    expect(toJakartaDateInput(addWorkingDays(SABTU, 0))).toBe("2026-10-26");
    expect(toJakartaDateInput(addWorkingDays(MINGGU, 0))).toBe("2026-10-26");

    // Sabtu + 1 hari kerja = Senin, karena Minggu dilewati.
    expect(toJakartaDateInput(addWorkingDays(SABTU, 1))).toBe("2026-10-26");
  });

  it("selalu mengembalikan hari kerja", () => {
    for (let offset = 0; offset < 30; offset += 1) {
      const start = new Date(SENIN.getTime() + offset * 24 * 60 * 60 * 1000);

      for (const days of [0, 1, 3, 5, 10]) {
        const result = addWorkingDays(start, days);
        expect(isWorkingDay(result), `${toJakartaDateInput(start)} + ${days}`).toBe(true);
      }
    }
  });

  it("selalu berakhir pukul 17:00 WIB", () => {
    expect(addWorkingDays(SENIN, 3).toISOString()).toBe("2026-10-22T10:00:00.000Z");
  });

  it("tidak mundur ketika diberi nilai negatif atau pecahan", () => {
    expect(toJakartaDateInput(addWorkingDays(SENIN, -5))).toBe("2026-10-19");
    expect(toJakartaDateInput(addWorkingDays(SENIN, 2.9))).toBe("2026-10-21");
  });
});

describe("tenggat CPAR bawaan", () => {
  it("memakai tiga hari kerja (§6 Modul 2)", () => {
    expect(DEFAULT_CPAR_DUE_WORKING_DAYS).toBe(3);
    expect(toJakartaDateInput(defaultCparDueDate(SENIN))).toBe("2026-10-22");
  });

  it("melewati akhir pekan saat klaim ditindaklanjuti Jumat", () => {
    // Jumat 23 Okt + 3 hari kerja = Rabu 28 Okt.
    expect(toJakartaDateInput(defaultCparDueDate(JUMAT))).toBe("2026-10-28");
  });
});

describe("normalisasi tenggat dari input tanggal", () => {
  it("mengangkat tanggal polos ke akhir jam kerja Jakarta", () => {
    // <input type="date"> mengirim "2026-10-28", yang diurai menjadi tengah malam UTC
    // alias 07:00 WIB — bukan tenggat yang dimaksud siapa pun.
    const fromInput = new Date("2026-10-28");

    expect(fromInput.toISOString()).toBe("2026-10-28T00:00:00.000Z");
    expect(endOfWorkingDay(fromInput).toISOString()).toBe("2026-10-28T10:00:00.000Z");
  });

  it("tidak menggeser tanggalnya saat dinormalkan", () => {
    expect(toJakartaDateInput(endOfWorkingDay(new Date("2026-10-28")))).toBe("2026-10-28");
  });

  it("idempotent — menormalkan dua kali tidak mengubah hasil", () => {
    const once = endOfWorkingDay(new Date("2026-10-28"));

    expect(endOfWorkingDay(once).toISOString()).toBe(once.toISOString());
  });
});
