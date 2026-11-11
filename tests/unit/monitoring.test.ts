import { describe, expect, it } from "vitest";

import type {
  MonitoringJudgement,
  MonitoringResultKind,
  MonitoringStatus,
} from "@/generated/prisma/enums";
import { isWorkingDay, toJakartaDateInput } from "@/lib/dates";
import {
  type PeriodState,
  type ResultRow,
  calendarRows,
  closingBlocker,
  missingCheckEvidence,
  monitoringProgress,
  ngChecks,
  unjudgedChecks,
  ngRate,
  planPeriods,
  resultBalance,
  totalResults,
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

const slot = (
  title: string,
  fileCount: number,
  judgement: MonitoringJudgement = "OK",
) => ({ title, fileCount, judgement });

describe("missingCheckEvidence", () => {
  it("menyebut item yang belum punya berkas, dalam urutan masuknya", () => {
    const missing = missingCheckEvidence([
      slot("Inspeksi 100% kaki pengunci", 2),
      slot("Catatan tekanan holding", 0),
      slot("Hasil audit proses", 0),
    ]);

    expect(missing).toEqual(["Catatan tekanan holding", "Hasil audit proses"]);
  });

  it("memotong judul yang panjang supaya pesannya tetap terbaca", () => {
    // Pesan penolakan memuat seluruh item yang kurang; sepuluh kalimat panjang akan
    // menenggelamkan maksudnya.
    const [only] = missingCheckEvidence([slot("A".repeat(100), 0)]);

    expect(only).toHaveLength(58);
    expect(only?.endsWith("…")).toBe(true);
  });

  it("tidak menyebut apa pun ketika semuanya sudah berbukti", () => {
    expect(missingCheckEvidence([slot("Inspeksi", 1)])).toEqual([]);
  });
});

describe("unjudgedChecks", () => {
  it("menyebut item yang belum punya hasil pemantauan", () => {
    // Berkas saja bukan kesimpulan: item yang buktinya ada tetapi tidak pernah dinilai
    // adalah item yang tidak pernah dibaca siapa pun.
    const pending = unjudgedChecks([
      slot("Inspeksi 100% kaki pengunci", 2, "OK"),
      slot("Catatan tekanan holding", 3, "PENDING"),
    ]);

    expect(pending).toEqual(["Catatan tekanan holding"]);
  });

  it("menganggap OK-NI sudah dinilai", () => {
    // "OK but need improvement" adalah keputusan, bukan keraguan.
    expect(unjudgedChecks([slot("Audit", 1, "OK_NEED_IMPROVEMENT")])).toEqual([]);
    expect(unjudgedChecks([slot("Audit", 1, "NG")])).toEqual([]);
  });
});

describe("ngChecks", () => {
  it("menyebut item yang hasilnya NG", () => {
    expect(
      ngChecks([slot("Inspeksi", 1, "OK"), slot("Tekanan holding", 1, "NG")]),
    ).toEqual(["Tekanan holding"]);
  });

  it("tidak menghitung OK-NI sebagai NG", () => {
    // OK-NI berarti hasilnya memuaskan tetapi standarnya perlu dirapikan; menyamakannya
    // dengan NG akan membuat peringatan ini berbunyi pada periode yang sebenarnya baik.
    expect(ngChecks([slot("Audit", 1, "OK_NEED_IMPROVEMENT")])).toEqual([]);
  });
});

describe("angka hasil pemantauan", () => {
  const row = (
    kind: MonitoringResultKind,
    day: string,
    quantity: number,
    okCount: number,
    ngCount: number,
  ): ResultRow => ({
    kind,
    // Pukul 09.00 WIB; yang diuji pengelompokan per tanggal Jakarta, bukan per UTC.
    recordedOn: new Date(`${day}T02:00:00Z`),
    quantity,
    okCount,
    ngCount,
  });

  it("menghitung bagian NG dari yang dinilai, bukan dari yang diproduksi", () => {
    // 500 diproduksi, baru 100 diperiksa, 2 di antaranya NG. Membaginya dengan 500 akan
    // melaporkan 0,4% — menurun hanya karena pemeriksaannya tertinggal.
    expect(ngRate(98, 2)).toBeCloseTo(0.02);
    expect(totalResults([row("PRODUCTION", "2026-11-16", 500, 98, 2)]).ngRate).toBeCloseTo(0.02);
  });

  it("tidak mengarang angka ketika belum ada yang dinilai", () => {
    expect(ngRate(0, 0)).toBeNull();
    expect(totalResults([row("PRODUCTION", "2026-11-16", 500, 0, 0)]).ngRate).toBeNull();
    expect(totalResults([]).ngRate).toBeNull();
  });

  it("menjumlahkan seluruh baris", () => {
    const totals = totalResults([
      row("PRODUCTION", "2026-11-16", 500, 498, 2),
      row("PRODUCTION", "2026-11-17", 300, 299, 1),
    ]);

    expect(totals).toMatchObject({ rows: 2, quantity: 800, okCount: 797, ngCount: 3 });
  });
});

describe("calendarRows", () => {
  const row = (
    kind: MonitoringResultKind,
    iso: string,
    quantity: number,
    okCount: number,
    ngCount: number,
  ): ResultRow => ({ kind, recordedOn: new Date(iso), quantity, okCount, ngCount });

  it("menggabungkan beberapa catatan pada tanggal yang sama menjadi satu baris", () => {
    // Dua shift pada hari yang sama adalah satu hari. Membacanya sebagai dua akan
    // membuat grafik menunjukkan frekuensi yang tidak pernah terjadi.
    const days = calendarRows([
      row("PRODUCTION", "2026-11-16T02:00:00Z", 300, 299, 1),
      row("PRODUCTION", "2026-11-16T09:00:00Z", 200, 199, 1),
    ]);

    expect(days).toHaveLength(1);
    expect(days[0]?.production).toMatchObject({ rows: 2, quantity: 500, ngCount: 2 });
  });

  it("menyandingkan produksi dan inspeksi pada baris tanggal yang sama", () => {
    const days = calendarRows([
      row("PRODUCTION", "2026-11-16T02:00:00Z", 500, 498, 2),
      row("INSPECTION", "2026-11-16T07:00:00Z", 120, 120, 0),
    ]);

    expect(days).toHaveLength(1);
    expect(days[0]?.production.quantity).toBe(500);
    expect(days[0]?.inspection.quantity).toBe(120);
  });

  it("memakai tanggal Jakarta, bukan UTC", () => {
    // 16 Nov pukul 23.00 WIB masih 16 Nov bagi yang mencatatnya, walau di UTC sudah
    // lewat tengah malam.
    const days = calendarRows([row("PRODUCTION", "2026-11-16T16:00:00Z", 100, 100, 0)]);

    expect(days[0]?.day).toBe("2026-11-16");
  });

  it("mengurutkan menurut tanggal, bukan urutan masukan", () => {
    const days = calendarRows([
      row("PRODUCTION", "2026-11-18T02:00:00Z", 100, 100, 0),
      row("PRODUCTION", "2026-11-16T02:00:00Z", 100, 100, 0),
    ]);

    expect(days.map((day) => day.day)).toEqual(["2026-11-16", "2026-11-18"]);
  });

  it("memberi jarak sebenarnya antar tanggal, supaya jeda terlihat di grafik", () => {
    const days = calendarRows([
      row("PRODUCTION", "2026-11-16T02:00:00Z", 100, 100, 0),
      row("PRODUCTION", "2026-11-26T02:00:00Z", 100, 100, 0),
    ]);

    expect((days[1]?.dayNumber ?? 0) - (days[0]?.dayNumber ?? 0)).toBe(10);
  });

  it("tidak mengarang baris untuk tanggal yang tidak punya catatan", () => {
    const days = calendarRows([
      row("PRODUCTION", "2026-11-16T02:00:00Z", 100, 100, 0),
      row("PRODUCTION", "2026-11-20T02:00:00Z", 100, 100, 0),
    ]);

    expect(days).toHaveLength(2);
  });
});

describe("resultBalance", () => {
  it("menyatakan seimbang hanya ketika OK + NG tepat sama dengan jumlahnya", () => {
    expect(resultBalance(500, 498, 2)).toMatchObject({ judged: 500, gap: 0, balanced: true });
  });

  it("menghitung selisihnya saat kurang", () => {
    // Baris dari tangkapan layar: 5.000 diproduksi, OK 2.000, NG 100.
    expect(resultBalance(5000, 2000, 100)).toMatchObject({ judged: 2100, gap: 2900, balanced: false });
  });

  it("memberi selisih negatif saat lebih, supaya arahnya terbaca tanpa membandingkan lagi", () => {
    expect(resultBalance(100, 99, 5)).toMatchObject({ judged: 104, gap: -4, balanced: false });
  });

  it("menganggap nol lawan nol seimbang", () => {
    // Bukan keadaan yang bisa disimpan — jumlah minimal 1 — tetapi fungsinya tidak boleh
    // membagi atau mengira-ngira; yang dijawabnya hanya "sama atau tidak".
    expect(resultBalance(0, 0, 0).balanced).toBe(true);
  });
});
