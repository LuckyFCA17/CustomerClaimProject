import { describe, expect, it } from "vitest";

import type { MonitoringStatus } from "@/generated/prisma/enums";
import { isWorkingDay, toJakartaDateInput } from "@/lib/dates";
import {
  type PeriodState,
  closingBlocker,
  monitoringProgress,
  planPeriods,
} from "@/lib/monitoring";

/**
 * Aturan Modul 4 (§6): kapan periode jatuh tempo, dan kapan klaim boleh ditutup.
 * Penutupan adalah satu-satunya perpindahan yang tidak dapat dibatalkan, jadi syaratnya
 * diuji sampai ke cabang-cabang yang jarang terjadi.
 */

// Rabu 2026-10-28, pukul 10:00 WIB.
const WEDNESDAY = new Date("2026-10-28T03:00:00.000Z");

function period(periodNo: number, status: MonitoringStatus, cycle = 1): PeriodState {
  return { periodNo, status, cycle };
}

describe("planPeriods", () => {
  it("membuat sebanyak periode yang diminta, bernomor urut dari satu", () => {
    const periods = planPeriods(3, 5, WEDNESDAY);

    expect(periods.map((entry) => entry.periodNo)).toEqual([1, 2, 3]);
  });

  it("tidak pernah menjatuhkan tenggat pada akhir pekan", () => {
    // Beragam interval supaya beberapa di antaranya pasti mendarat di Sabtu/Minggu
    // kalau perhitungannya memakai hari kalender.
    for (const interval of [1, 2, 3, 4, 5, 6, 7]) {
      for (const entry of planPeriods(6, interval, WEDNESDAY)) {
        expect(isWorkingDay(entry.dueDate), `interval ${interval}, periode ${entry.periodNo}`).toBe(
          true,
        );
      }
    }
  });

  it("menjaga tenggat selalu menaik", () => {
    const periods = planPeriods(5, 3, WEDNESDAY);

    for (let index = 1; index < periods.length; index += 1) {
      expect(periods[index].dueDate.getTime()).toBeGreaterThan(
        periods[index - 1].dueDate.getTime(),
      );
    }
  });

  it("menaruh tenggat di akhir jam kerja, bukan tengah malam", () => {
    const [first] = planPeriods(1, 1, WEDNESDAY);

    // 17:00 WIB = 10:00 UTC. Tanpa normalisasi ini periode terbaca kedaluwarsa
    // sejak pukul tujuh pagi pada hari H.
    expect(first.dueDate.getUTCHours()).toBe(10);
    expect(toJakartaDateInput(first.dueDate)).toBe("2026-10-29");
  });

  it("mengembalikan daftar kosong bila jumlah periode nol", () => {
    expect(planPeriods(0, 5, WEDNESDAY)).toEqual([]);
  });
});

describe("monitoringProgress", () => {
  it("menghitung hanya periode siklus berjalan", () => {
    const progress = monitoringProgress(
      [
        period(1, "NOT_EFFECTIVE", 1),
        period(1, "EFFECTIVE", 2),
        period(2, "PENDING", 2),
      ],
      2,
    );

    expect(progress.total).toBe(2);
    expect(progress.effective).toBe(1);
    expect(progress.pending).toEqual([2]);
    expect(progress.notEffective).toEqual([]);
  });

  it("lengkap ketika seluruh periode siklus berjalan efektif", () => {
    const progress = monitoringProgress([period(1, "EFFECTIVE"), period(2, "EFFECTIVE")], 1);

    expect(progress.isComplete).toBe(true);
  });

  it("tidak pernah lengkap tanpa periode sama sekali", () => {
    // CAPA yang tidak pernah diuji bukan CAPA yang berhasil.
    const progress = monitoringProgress([], 1);

    expect(progress.total).toBe(0);
    expect(progress.isComplete).toBe(false);
  });

  it("mengurutkan nomor periode, bukan mengikuti urutan masukan", () => {
    const progress = monitoringProgress(
      [period(3, "PENDING"), period(1, "PENDING"), period(2, "PENDING")],
      1,
    );

    expect(progress.pending).toEqual([1, 2, 3]);
  });

  it("satu periode gagal membuat seluruh siklus belum lengkap", () => {
    const progress = monitoringProgress(
      [period(1, "EFFECTIVE"), period(2, "NOT_EFFECTIVE"), period(3, "EFFECTIVE")],
      1,
    );

    expect(progress.isComplete).toBe(false);
    expect(progress.notEffective).toEqual([2]);
  });
});

describe("closingBlocker", () => {
  it("menahan penutupan ketika belum ada periode", () => {
    expect(closingBlocker(monitoringProgress([], 1))).toMatch(/Belum ada periode/);
  });

  it("menahan penutupan ketika ada periode yang belum dinilai", () => {
    const blocker = closingBlocker(
      monitoringProgress([period(1, "EFFECTIVE"), period(2, "PENDING")], 1),
    );

    expect(blocker).toMatch(/Periode 2 belum dinilai/);
  });

  it("menahan penutupan ketika ada periode Not Effective", () => {
    const blocker = closingBlocker(
      monitoringProgress([period(1, "EFFECTIVE"), period(2, "NOT_EFFECTIVE")], 1),
    );

    expect(blocker).toMatch(/Periode 2 dinyatakan Not Effective/);
  });

  it("menyebut kegagalan lebih dulu daripada yang belum dinilai", () => {
    // Keduanya menghalangi, tetapi yang gagal menuntut siklus baru — itu kabar yang
    // lebih penting daripada "masih ada yang belum dinilai".
    const blocker = closingBlocker(
      monitoringProgress([period(1, "NOT_EFFECTIVE"), period(2, "PENDING")], 1),
    );

    expect(blocker).toMatch(/Not Effective/);
  });

  it("melepas penutupan ketika seluruh periode efektif", () => {
    expect(closingBlocker(monitoringProgress([period(1, "EFFECTIVE")], 1))).toBeNull();
  });
});
