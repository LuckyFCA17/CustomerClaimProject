import { describe, expect, it } from "vitest";

import {
  CLAIM_TYPE_LABEL,
  CLAIM_TYPE_ORDER,
  type LeadTimeInput,
  OCCURRENCE_ORDER,
  UNKNOWN_KEY,
  daysBetween,
  formatDays,
  leadTimeSummary,
  median,
  occurrenceBreakdown,
  repeatShare,
  totalOf,
  typeBreakdown,
} from "@/lib/analytics";
import { ClaimType } from "@/generated/prisma/enums";

/**
 * Perhitungan grafik jenis klaim (§7).
 *
 * Yang diuji terutama dua hal yang mudah luput dan berakibat pada bacaan orang:
 * urutannya tetap walau angkanya berubah, dan jenis yang nol tetap digambar.
 */

describe("typeBreakdown", () => {
  it("menjaga urutan tetap, bukan urutan menurut jumlah", () => {
    // Warna mengikuti jenisnya, bukan peringkatnya. Mengurutkan menurut jumlah membuat
    // warna berpindah tiap kali datanya berubah, dan pembaca yang membandingkan dua
    // periode akan mengira jenis klaimnya yang bertukar.
    const rows = typeBreakdown({ INFORMATION_ONLY: 90, OFFICIAL: 1, NON_OFFICIAL: 50 });

    expect(rows.map((row) => row.key)).toEqual([...CLAIM_TYPE_ORDER]);
  });

  it("tetap menggambar jenis yang tidak punya klaim", () => {
    // Menghilangkannya membuat grafik dua batang terbaca seolah portal hanya mengenal
    // dua jenis klaim — padahal yang ketiga memang nol, dan itu sendiri sebuah temuan.
    const rows = typeBreakdown({ OFFICIAL: 3 });

    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.key === "NON_OFFICIAL")).toMatchObject({ count: 0, share: 0 });
  });

  it("menghitung porsi terhadap total, bukan terhadap jenis terbanyak", () => {
    const rows = typeBreakdown({ OFFICIAL: 3, NON_OFFICIAL: 1 });

    expect(rows[0]?.share).toBeCloseTo(0.75);
    expect(rows[1]?.share).toBeCloseTo(0.25);
  });

  it("tidak membagi dengan nol saat belum ada klaim sama sekali", () => {
    const rows = typeBreakdown({});

    expect(totalOf(rows)).toBe(0);
    expect(rows.every((row) => row.share === 0)).toBe(true);
  });

  it("porsinya selalu berjumlah satu selama ada isinya", () => {
    const rows = typeBreakdown({ OFFICIAL: 7, NON_OFFICIAL: 11, INFORMATION_ONLY: 2 });

    expect(rows.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(1);
    expect(totalOf(rows)).toBe(20);
  });
});

describe("integritas label", () => {
  it("menamai setiap jenis klaim yang dikenal Prisma", () => {
    // Jenis baru di skema tanpa label di sini akan tampil sebagai kode mentah pada
    // grafik dan pada berkas ekspor sekaligus — keduanya membaca peta yang sama.
    expect(Object.keys(CLAIM_TYPE_LABEL).sort()).toEqual(Object.values(ClaimType).sort());
  });

  it("urutan tampilnya memuat seluruh jenis, tanpa kembar", () => {
    expect([...CLAIM_TYPE_ORDER].sort()).toEqual(Object.values(ClaimType).sort());
  });
});

describe("klaim yang jenisnya belum diisi", () => {
  it("muncul sebagai baris tersendiri, bukan dibuang", () => {
    // Dibuang, total grafik ini tidak cocok dengan grafik klaim bulanan di sebelahnya —
    // dan selisih tanpa penjelasan membuat seluruh halaman tidak dipercaya.
    const rows = typeBreakdown({ OFFICIAL: 9, NON_OFFICIAL: 1 }, 4);

    expect(rows).toHaveLength(4);
    expect(rows.at(-1)).toMatchObject({ key: UNKNOWN_KEY, label: "Belum diisi", count: 4 });
    expect(totalOf(rows)).toBe(14);
  });

  it("ikut membagi porsinya, bukan dihitung di luar total", () => {
    const rows = typeBreakdown({ OFFICIAL: 3 }, 1);

    expect(rows[0]?.share).toBeCloseTo(0.75);
    expect(rows.at(-1)?.share).toBeCloseTo(0.25);
  });

  it("tidak menambah baris ketika semuanya sudah berjenis", () => {
    // Baris "belum diisi" bernilai nol hanya menambah baris yang tidak pernah berubah.
    expect(typeBreakdown({ OFFICIAL: 3 }, 0)).toHaveLength(3);
    expect(typeBreakdown({ OFFICIAL: 3 })).toHaveLength(3);
  });

  it("mengabaikan jumlah negatif yang mustahil", () => {
    expect(typeBreakdown({ OFFICIAL: 3 }, -5)).toHaveLength(3);
  });
});

describe("median", () => {
  it("mengambil nilai tengah pada jumlah ganjil", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("merata-ratakan dua nilai tengah pada jumlah genap", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("tidak terseret satu nilai ekstrem", () => {
    // Inilah sebabnya median dipakai: satu klaim yang menggantung setahun menarik
    // rata-rata sampai angkanya tidak menggambarkan klaim mana pun.
    const values = [2, 3, 3, 4, 365];

    expect(median(values)).toBe(3);
    expect(values.reduce((a, b) => a + b, 0) / values.length).toBeGreaterThan(70);
  });

  it("mengembalikan null ketika tidak ada apa pun", () => {
    expect(median([])).toBeNull();
  });
});

describe("daysBetween", () => {
  const at = (iso: string) => new Date(iso);

  it("menghitung selisih hari kalender", () => {
    expect(daysBetween(at("2026-11-01T00:00:00Z"), at("2026-11-04T00:00:00Z"))).toBe(3);
  });

  it("menghitung akhir pekan juga", () => {
    // Tenggat portal memakai hari kerja, tetapi yang dijawab di sini berapa lama orang
    // menunggu — dan akhir pekan ikut berjalan bagi yang menunggu.
    expect(daysBetween(at("2026-11-06T00:00:00Z"), at("2026-11-09T00:00:00Z"))).toBe(3);
  });

  it("mengabaikan ujung yang belum ada", () => {
    expect(daysBetween(null, at("2026-11-04T00:00:00Z"))).toBeNull();
    expect(daysBetween(at("2026-11-04T00:00:00Z"), null)).toBeNull();
  });

  it("menolak urutan terbalik alih-alih menghasilkan angka negatif", () => {
    // Tanggal yang tersunting menjadi sesudah tanggal terbit akan menarik median ke
    // bawah secara diam-diam; dibuang, ia hanya mengurangi sampel yang memang disebut.
    expect(daysBetween(at("2026-11-10T00:00:00Z"), at("2026-11-01T00:00:00Z"))).toBeNull();
  });
});

describe("leadTimeSummary", () => {
  const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

  const claim = (overrides: Partial<LeadTimeInput> = {}): LeadTimeInput => ({
    receivedAt: at("2026-11-01"),
    publishedAt: at("2026-11-03"),
    cparIssuedAt: at("2026-11-03"),
    cparSubmittedAt: at("2026-11-09"),
    cparApprovedAt: at("2026-11-11"),
    closedAt: at("2026-11-26"),
    ...overrides,
  });

  it("memberi satu median per tahap", () => {
    const summary = leadTimeSummary([claim()]);
    const byStage = Object.fromEntries(summary.stages.map((row) => [row.stage, row.medianDays]));

    expect(byStage).toEqual({ RESPONSE: 2, FILLING: 6, VERIFICATION: 2, MONITORING: 15 });
    expect(summary.totalMedianDays).toBe(25);
  });

  it("menghitung sampel per tahap, bukan satu sampel untuk semuanya", () => {
    // Klaim yang belum disetujui belum punya lama verifikasi. Median yang disandingkan
    // tanpa menyebut sampelnya mengundang perbandingan yang tidak sah.
    const summary = leadTimeSummary([
      claim(),
      claim({ cparApprovedAt: null, closedAt: null }),
    ]);

    const sample = Object.fromEntries(summary.stages.map((row) => [row.stage, row.sample]));

    expect(sample).toEqual({ RESPONSE: 2, FILLING: 2, VERIFICATION: 1, MONITORING: 1 });
    expect(summary.totalSample).toBe(1);
  });

  it("menyebut tahap yang belum pernah dilewati sebagai null, bukan nol", () => {
    // Nol berarti "selesai seketika"; null berarti "belum ada yang sampai ke sana".
    // Menyamakan keduanya membuat tahap yang macet terbaca sebagai tahap tercepat.
    const summary = leadTimeSummary([claim({ cparApprovedAt: null, closedAt: null })]);
    const verification = summary.stages.find((row) => row.stage === "VERIFICATION");

    expect(verification?.medianDays).toBeNull();
    expect(verification?.sample).toBe(0);
  });

  it("menyebut yang terlama, bukan hanya mediannya", () => {
    const summary = leadTimeSummary([
      claim({ cparSubmittedAt: at("2026-11-05") }),
      claim({ cparSubmittedAt: at("2026-11-09") }),
      claim({ cparSubmittedAt: at("2026-11-30") }),
    ]);

    const filling = summary.stages.find((row) => row.stage === "FILLING");

    expect(filling?.medianDays).toBe(6);
    expect(filling?.slowestDays).toBe(27);
  });

  it("tidak melempar pada daftar kosong", () => {
    const summary = leadTimeSummary([]);

    expect(summary.totalMedianDays).toBeNull();
    expect(summary.stages.every((row) => row.medianDays === null && row.sample === 0)).toBe(true);
  });
});

describe("occurrenceBreakdown", () => {
  it("menjaga urutan pertama → kedua → ketiga", () => {
    // Urutannya punya arti: makin ke bawah makin sering berulang, dan warnanya ikut
    // menggelap. Mengurutkan menurut jumlah menghapus arti itu.
    const rows = occurrenceBreakdown({ THIRD_OR_MORE: 9, FIRST_TIME: 1 });

    expect(rows.map((row) => row.key)).toEqual([...OCCURRENCE_ORDER]);
  });

  it("menghitung porsi klaim yang pernah terjadi sebelumnya", () => {
    // Pertama kali bukan pengulangan; yang menjadi perhatian kedua dan ketiga.
    const rows = occurrenceBreakdown({ FIRST_TIME: 6, SECOND_TIME: 3, THIRD_OR_MORE: 1 });

    expect(repeatShare(rows)).toBeCloseTo(0.4);
  });

  it("menghitung klaim yang belum diisi ke dalam penyebut", () => {
    // Dikeluarkan dari penyebut, porsi pengulangan akan tampak lebih besar daripada
    // yang sebenarnya diketahui.
    const rows = occurrenceBreakdown({ FIRST_TIME: 1, SECOND_TIME: 1 }, 2);

    expect(totalOf(rows)).toBe(4);
    expect(repeatShare(rows)).toBeCloseTo(0.25);
  });

  it("tidak membagi dengan nol saat belum ada klaim", () => {
    expect(repeatShare(occurrenceBreakdown({}))).toBe(0);
  });
});

describe("formatDays", () => {
  it("menulis setengah hari apa adanya", () => {
    // Median dari sampel genap memang bisa pecahan; membulatkannya menyembunyikan
    // selisih yang nyata pada tahap yang hanya berlangsung dua hari.
    expect(formatDays(2.5)).toBe("2,5 hari");
    expect(formatDays(3)).toBe("3 hari");
  });

  it("menandai yang belum terukur, bukan menulis nol", () => {
    expect(formatDays(null)).toBe("—");
  });
});
