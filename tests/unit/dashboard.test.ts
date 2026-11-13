import { describe, expect, it } from "vitest";

import {
  MAX_AXIS_LABELS,
  MAX_MONTHS,
  axisStep,
  axisTicks,
  monthAxis,
  monthlySeries,
  paretoRows,
  percent,
  resolvePeriod,
} from "@/lib/dashboard";

/**
 * Angka dashboard diuji di sini, bukan lewat tangkapan layar: yang mudah salah bukan
 * gambarnya, melainkan pengelompokan bulan di sekitar pergantian tahun dan tengah
 * malam WIB, serta baris mana yang terhitung "vital few".
 */

/** 2026-11-02 10:00 WIB. */
const NOW = new Date("2026-11-02T03:00:00Z");

describe("monthlySeries", () => {
  it("mengembalikan rentang penuh termasuk bulan yang kosong", () => {
    const series = monthlySeries([], NOW, 12);

    expect(series).toHaveLength(12);
    expect(series[0].key).toBe("2025-12");
    expect(series[11].key).toBe("2026-11");
    expect(series.every((bucket) => bucket.count === 0)).toBe(true);
  });

  it("melewati pergantian tahun tanpa bulan ke-13 atau bulan hilang", () => {
    const series = monthlySeries([], new Date("2026-02-10T03:00:00Z"), 4);

    expect(series.map((bucket) => bucket.key)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(series.map((bucket) => bucket.label)).toEqual(["Nov", "Des", "Jan", "Feb"]);
  });

  it("menghitung klaim ke bulan menurut kalender Jakarta, bukan UTC", () => {
    // 2026-10-31 23.30 WIB = 2026-10-31 16.30 UTC — masih Oktober di kedua zona.
    const stillOctober = new Date("2026-10-31T16:30:00Z");
    // 2026-11-01 00.30 WIB = 2026-10-31 17.30 UTC — sudah November di Jakarta,
    // tetapi masih Oktober bila dihitung dalam UTC. Inilah yang diuji.
    const alreadyNovember = new Date("2026-10-31T17:30:00Z");

    const series = monthlySeries([stillOctober, alreadyNovember], NOW, 3);
    const byKey = Object.fromEntries(series.map((bucket) => [bucket.key, bucket.count]));

    expect(byKey["2026-10"]).toBe(1);
    expect(byKey["2026-11"]).toBe(1);
  });

  it("mengabaikan klaim di luar rentang tanpa melempar", () => {
    const series = monthlySeries([new Date("2019-03-04T03:00:00Z")], NOW, 6);

    expect(series.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(0);
  });
});

/**
 * Sumbu X grafik bulanan.
 *
 * Yang diuji di sini adalah hal yang dahulu merusak tata letaknya: pada periode lebih
 * dari satu tahun, satu label per kolom lebih lebar daripada grafiknya sendiri. Jadi
 * yang dijaga adalah jumlah labelnya, letaknya pada bulan yang bermakna, dan bahwa
 * tiap kolom tetap punya selnya sendiri — karena itulah yang menjaga label sejajar
 * dengan batangnya.
 */
describe("axisStep", () => {
  it("memberi label tiap bulan selama masih dua belas kolom atau kurang", () => {
    expect(axisStep(1)).toBe(1);
    expect(axisStep(12)).toBe(1);
  });

  it("menjarangkan label begitu kolomnya lebih banyak", () => {
    expect(axisStep(13)).toBe(2);
    expect(axisStep(16)).toBe(2);
    expect(axisStep(17)).toBe(3);
    expect(axisStep(24)).toBe(3);
    expect(axisStep(25)).toBe(6);
    expect(axisStep(MAX_MONTHS)).toBe(6);
  });

  it("tidak pernah melampaui batas jumlah label, sampai periode terpanjang", () => {
    for (let columns = 1; columns <= MAX_MONTHS; columns += 1) {
      const labels = Math.ceil(columns / axisStep(columns));

      expect(labels).toBeLessThanOrEqual(Math.max(MAX_AXIS_LABELS, 12));
    }
  });

  it("selalu berupa pembagi yang membuat Januari ikut berlabel", () => {
    // 0 % step === 0 untuk langkah apa pun, jadi awal tahun tidak pernah hilang —
    // dan di situlah tahunnya disebut.
    for (let columns = 13; columns <= MAX_MONTHS; columns += 1) {
      expect([2, 3, 6]).toContain(axisStep(columns));
    }
  });
});

describe("monthAxis", () => {
  it("mengembalikan satu entri per kolom, bukan hanya kolom yang berlabel", () => {
    const series = monthlySeries([], NOW, 24);

    expect(monthAxis(series)).toHaveLength(24);
  });

  it("memberi label tiap bulan pada rentang dua belas bulan", () => {
    const axis = monthAxis(monthlySeries([], NOW, 12));

    expect(axis.every((tick) => tick.month !== null)).toBe(true);
  });

  it("menjatuhkan label pada awal kuartal untuk rentang dua tahun", () => {
    const series = monthlySeries([], NOW, 24);
    const axis = monthAxis(series);

    const labelled = series
      .map((bucket, index) => ({ bucket, tick: axis[index] }))
      .filter((entry) => entry.tick.month !== null);

    // Serinya mundur 24 bulan dari Nov 2026, jadi ia mulai di Des 2024 dan memuat
    // kuartal dua tahun penuh — delapan label, tepat di batas MAX_AXIS_LABELS.
    expect(labelled.map((entry) => entry.bucket.key)).toEqual([
      "2025-01",
      "2025-04",
      "2025-07",
      "2025-10",
      "2026-01",
      "2026-04",
      "2026-07",
      "2026-10",
    ]);
    // Bulan yang tersisa memang sengaja kosong, bukan diberi teks kosong.
    expect(axis.filter((tick) => tick.month === null)).toHaveLength(16);
  });

  it("menyebut tiap tahun sekali, di tengah bentangannya", () => {
    const axis = monthAxis(monthlySeries([], NOW, 24));
    const years = axis
      .map((tick, index) => ({ index, year: tick.year }))
      .filter((entry) => entry.year !== null);

    expect(years.map((entry) => entry.year)).toEqual(["2024", "2025", "2026"]);
    // Des 2024 sendirian di kolom 0; 2025 membentang di kolom 1–12; 2026 di 13–23.
    expect(years.map((entry) => entry.index)).toEqual([0, 6, 18]);
  });

  it("tidak menyebut tahun sama sekali bila seluruh seri satu tahun", () => {
    const axis = monthAxis(monthlySeries([], new Date("2026-12-15T03:00:00Z"), 12));

    expect(axis.every((tick) => tick.year === null)).toBe(true);
  });
});

describe("paretoRows", () => {
  const entries = [
    { label: "Crack / Broken", count: 50 },
    { label: "Dimension NG", count: 25 },
    { label: "Scratch", count: 15 },
    { label: "Burr", count: 7 },
    { label: "Warna beda", count: 3 },
  ];

  it("mengurutkan dari terbanyak dan menghitung kumulatif", () => {
    const rows = paretoRows(entries);

    expect(rows.map((row) => row.label)).toEqual([
      "Crack / Broken",
      "Dimension NG",
      "Scratch",
      "Burr",
      "Warna beda",
    ]);
    expect(rows[0].share).toBeCloseTo(0.5);
    expect(rows[2].cumulative).toBeCloseTo(0.9);
    expect(rows[rows.length - 1].cumulative).toBeCloseTo(1);
  });

  it("menandai baris yang diperlukan untuk mencapai ambang 80%", () => {
    const rows = paretoRows(entries);

    // Kumulatif: 50% · 75% · 90%. Baris ketiga tetap vital karena tanpanya
    // ambang 80% tidak tercapai; baris sesudahnya tidak.
    expect(rows.filter((row) => row.vital).map((row) => row.label)).toEqual([
      "Crack / Broken",
      "Dimension NG",
      "Scratch",
    ]);
  });

  it("mengurutkan jumlah yang sama menurut label agar hasilnya tetap", () => {
    const tied = [
      { label: "Zeta", count: 4 },
      { label: "Alfa", count: 4 },
    ];

    expect(paretoRows(tied).map((row) => row.label)).toEqual(["Alfa", "Zeta"]);
  });

  it("membuang sebab bernilai nol dan mengembalikan kosong bila tidak ada data", () => {
    expect(paretoRows([{ label: "Kosong", count: 0 }])).toEqual([]);
    expect(paretoRows([])).toEqual([]);
  });

  it("menandai satu-satunya sebab sebagai vital", () => {
    const rows = paretoRows([{ label: "Crack", count: 9 }]);

    expect(rows).toHaveLength(1);
    expect(rows[0].vital).toBe(true);
    expect(rows[0].cumulative).toBe(1);
  });
});

describe("axisTicks", () => {
  it("berhenti di atas nilai tertinggi, bukan tepat padanya", () => {
    const ticks = axisTicks(7);

    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(7);
  });

  it("memakai langkah bulat 1·2·5·10", () => {
    for (const max of [3, 9, 17, 48, 130, 999]) {
      const ticks = axisTicks(max);
      const step = ticks[1] - ticks[0];
      const unit = step / 10 ** Math.floor(Math.log10(step));

      expect([1, 2, 5, 10]).toContain(Math.round(unit));
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max);
    }
  });

  it("tetap memberi sumbu saat semua nilai nol", () => {
    expect(axisTicks(0)).toEqual([0, 1]);
  });
});

describe("percent", () => {
  it("membulatkan ke persen penuh", () => {
    expect(percent(0.625)).toBe("63%");
    expect(percent(1)).toBe("100%");
    expect(percent(0)).toBe("0%");
  });
});

/**
 * Periode yang diminta lewat URL.
 *
 * Diuji agak teliti karena nilainya datang dari luar: bisa diketik tangan, bisa
 * tertinggal dari tautan lama, dan yang keluar dari fungsi ini langsung menjadi batas
 * query basis data serta jumlah kolom grafik.
 */
describe("resolvePeriod", () => {
  const NOW_2026_10 = new Date("2026-10-20T03:00:00Z");

  it("jatuh ke dua belas bulan terakhir bila tidak diminta apa pun", () => {
    const period = resolvePeriod(undefined, undefined, NOW_2026_10);

    expect(period.from).toBe("2025-11");
    expect(period.to).toBe("2026-10");
    expect(period.months).toBe(12);
    expect(period.isDefault).toBe(true);
  });

  it("menghormati rentang yang diminta", () => {
    const period = resolvePeriod("2026-01", "2026-06", NOW_2026_10);

    expect(period.months).toBe(6);
    expect(period.label).toBe("Januari 2026 – Juni 2026");
    expect(period.isDefault).toBe(false);
  });

  it("menyebut satu bulan tanpa tanda pisah", () => {
    expect(resolvePeriod("2026-03", "2026-03", NOW_2026_10).label).toBe("Maret 2026");
    expect(resolvePeriod("2026-03", "2026-03", NOW_2026_10).months).toBe(1);
  });

  it("menukar rentang yang terbalik alih-alih menolaknya", () => {
    const period = resolvePeriod("2026-06", "2026-01", NOW_2026_10);

    expect(period.from).toBe("2026-01");
    expect(period.to).toBe("2026-06");
  });

  it("mengabaikan nilai yang tidak berbentuk YYYY-MM", () => {
    for (const bad of ["", "2026", "2026-13", "2026-00", "abcd-ef", "1999-05", "2101-05"]) {
      const period = resolvePeriod(bad, undefined, NOW_2026_10);

      expect(period.isDefault, bad).toBe(true);
    }
  });

  it("memotong rentang yang terlalu panjang dari ujung awal", () => {
    // Bulan terakhir yang diminta tetap terlihat; itu yang biasanya ingin dilihat orang.
    const period = resolvePeriod("2000-01", "2026-10", NOW_2026_10);

    expect(period.months).toBe(MAX_MONTHS);
    expect(period.to).toBe("2026-10");
    expect(period.from).toBe("2023-11");
  });

  it("memberi batas query yang mencakup bulan Jakarta seutuhnya", () => {
    const period = resolvePeriod("2026-01", "2026-01", NOW_2026_10);

    // 1 Januari 00.00 WIB = 31 Desember 17.00 UTC. Memakai tengah malam UTC akan
    // membuang klaim yang masuk pada tujuh jam pertama bulan itu.
    expect(period.start.toISOString()).toBe("2025-12-31T17:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-01-31T17:00:00.000Z");
  });

  it("menghasilkan deret sepanjang periode yang diminta", () => {
    const period = resolvePeriod("2026-01", "2026-06", NOW_2026_10);
    const series = monthlySeries([], period.anchor, period.months);

    expect(series).toHaveLength(6);
    expect(series[0].key).toBe("2026-01");
    expect(series[5].key).toBe("2026-06");
  });
});
