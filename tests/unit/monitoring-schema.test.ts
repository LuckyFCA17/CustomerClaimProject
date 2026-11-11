import { describe, expect, it } from "vitest";

import {
  EFFECTIVENESS_NOTE_MIN,
  REPORT_SUMMARY_MIN,
  effectivenessSchema,
  improvementReportSchema,
  monitoringResultSchema,
  startMonitoringSchema,
} from "@/schemas/monitoring";

function errorsFor(
  result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } },
  field: string,
) {
  if (result.success || !result.error) return [];

  return result.error.issues
    .filter((issue) => issue.path.map(String).join(".") === field)
    .map((issue) => issue.message);
}

describe("startMonitoringSchema", () => {
  const JADWAL = {
    periodCount: "3",
    intervalDays: "5",
    checkItems: ["Hasil inspeksi 100% kaki pengunci"],
    note: "",
  };

  it("menerima jadwal yang masuk akal", () => {
    const result = startMonitoringSchema.safeParse(JADWAL);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.periodCount).toBe(3);
  });

  it("menolak jadwal tanpa satu pun item yang dipantau", () => {
    // Pemantauan yang dibuka tanpa menyebut apa yang diukur berakhir dengan penilaian
    // yang mencari bukti apa saja yang kebetulan tersedia.
    expect(
      errorsFor(startMonitoringSchema.safeParse({ ...JADWAL, checkItems: [] }), "checkItems"),
    ).toHaveLength(1);
  });

  it("membuang baris kosong sebelum menghitung jumlahnya", () => {
    // Formulirnya selalu menyisakan satu baris kosong di bawah; itu bukan item.
    const result = startMonitoringSchema.safeParse({
      ...JADWAL,
      checkItems: ["  Hasil inspeksi 100% kaki pengunci  ", "", "   "],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.checkItems).toEqual(["Hasil inspeksi 100% kaki pengunci"]);
    }
  });

  it("menolak item yang terlalu pendek untuk berarti apa pun", () => {
    expect(
      errorsFor(startMonitoringSchema.safeParse({ ...JADWAL, checkItems: ["ok"] }), "checkItems.0"),
    ).toHaveLength(1);
  });

  it("menolak item yang ditulis dua kali", () => {
    // Item kembar menghasilkan dua kotak bukti untuk satu hal yang sama, dan salah
    // satunya akan selalu kosong.
    const result = startMonitoringSchema.safeParse({
      ...JADWAL,
      checkItems: ["Inspeksi kaki pengunci", "inspeksi KAKI pengunci"],
    });

    expect(result.success).toBe(false);
  });

  it("menolak nol periode — CAPA tanpa periode tidak pernah diuji", () => {
    expect(errorsFor(startMonitoringSchema.safeParse({ periodCount: 0, intervalDays: 5 }), "periodCount"))
      .toHaveLength(1);
  });

  it("menolak jarak nol hari", () => {
    expect(
      errorsFor(startMonitoringSchema.safeParse({ periodCount: 3, intervalDays: 0 }), "intervalDays"),
    ).toHaveLength(1);
  });

  it("menolak pecahan", () => {
    expect(
      errorsFor(startMonitoringSchema.safeParse({ periodCount: 2.5, intervalDays: 5 }), "periodCount"),
    ).toHaveLength(1);
  });

  it("menolak jumlah periode di luar batas atas", () => {
    expect(
      errorsFor(startMonitoringSchema.safeParse({ periodCount: 13, intervalDays: 5 }), "periodCount"),
    ).toHaveLength(1);
  });

  it("menolak nilai yang bukan angka", () => {
    expect(startMonitoringSchema.safeParse({ periodCount: "tiga", intervalDays: 5 }).success).toBe(
      false,
    );
  });
});

describe("effectivenessSchema", () => {
  const catatan = "Masih ditemukan 3 pcs kaki patah pada 500 pcs pertama.";

  it("menerima EFFECTIVE tanpa catatan", () => {
    expect(effectivenessSchema.safeParse({ result: "EFFECTIVE" }).success).toBe(true);
  });

  it("mewajibkan catatan pada NOT_EFFECTIVE", () => {
    expect(errorsFor(effectivenessSchema.safeParse({ result: "NOT_EFFECTIVE" }), "note")).toHaveLength(
      1,
    );
  });

  it("menolak catatan NOT_EFFECTIVE yang terlalu pendek", () => {
    const result = effectivenessSchema.safeParse({ result: "NOT_EFFECTIVE", note: "gagal" });

    expect(errorsFor(result, "note")).toHaveLength(1);
    expect("gagal".length).toBeLessThan(EFFECTIVENESS_NOTE_MIN);
  });

  it("menerima NOT_EFFECTIVE dengan catatan memadai", () => {
    expect(effectivenessSchema.safeParse({ result: "NOT_EFFECTIVE", note: catatan }).success).toBe(
      true,
    );
  });

  it("menolak PENDING — itu keadaan awal, bukan keputusan manusia", () => {
    expect(effectivenessSchema.safeParse({ result: "PENDING" }).success).toBe(false);
  });
});

describe("improvementReportSchema", () => {
  const ringkasan =
    "Seal mesin injeksi 4 diganti terjadwal per 500 jam operasi dan alarm tekanan dipasang; tiga periode pemantauan nol temuan.";

  it("menerima laporan dengan ringkasan memadai", () => {
    const result = improvementReportSchema.safeParse({ summary: ringkasan });

    expect(result.success).toBe(true);
  });

  it("menolak ringkasan yang terlalu pendek", () => {
    const result = improvementReportSchema.safeParse({ summary: "selesai" });

    expect(errorsFor(result, "summary")).toHaveLength(1);
    expect("selesai".length).toBeLessThan(REPORT_SUMMARY_MIN);
  });

  it("menghitung panjang setelah spasi dibuang", () => {
    const padded = `${" ".repeat(80)}selesai${" ".repeat(80)}`;

    expect(improvementReportSchema.safeParse({ summary: padded }).success).toBe(false);
  });

  it("tidak mewajibkan blok A3 satu pun", () => {
    const result = improvementReportSchema.safeParse({ summary: ringkasan, background: "" });

    expect(result.success).toBe(true);
  });

  it("menerima blok A3 yang diisi sebagian", () => {
    const result = improvementReportSchema.safeParse({
      summary: ringkasan,
      background: "Klaim pelanggan atas clip patah.",
      result: "Nol temuan pada tiga periode.",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.background).toBe("Klaim pelanggan atas clip patah.");
      // Blok yang tidak dikirim tetap undefined, bukan string kosong — pemanggil
      // menormalkannya sendiri sebelum menyimpan, dan kedua bentuk itu sama-sama
      // berarti "tidak diisi".
      expect(result.data.target).toBeUndefined();
    }
  });
});

describe("monitoringResultSchema", () => {
  const BARIS = {
    kind: "PRODUCTION",
    recordedOn: "2026-11-16",
    quantity: "500",
    okCount: "498",
    ngCount: "2",
    note: "",
  };

  it("menerima satu baris angka yang utuh", () => {
    const result = monitoringResultSchema.safeParse(BARIS);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.quantity).toBe(500);
  });

  it("membiarkan sebagian yang belum dinilai", () => {
    // 500 diproduksi, baru 100 diperiksa. Itu keadaan wajar di tengah periode, bukan
    // kesalahan — yang salah hanya bila yang dinilai lebih banyak daripada yang ada.
    expect(monitoringResultSchema.safeParse({ ...BARIS, okCount: "98", ngCount: "2" }).success).toBe(
      true,
    );
  });

  it("menolak OK + NG yang melebihi jumlahnya", () => {
    expect(
      errorsFor(
        monitoringResultSchema.safeParse({ ...BARIS, quantity: "100", okCount: "99", ngCount: "5" }),
        "okCount",
      ),
    ).toHaveLength(1);
  });

  it("menolak jumlah nol — baris tanpa barang tidak mengukur apa pun", () => {
    expect(
      errorsFor(monitoringResultSchema.safeParse({ ...BARIS, quantity: "0" }), "quantity"),
    ).toHaveLength(1);
  });

  it("menolak angka negatif dan pecahan", () => {
    expect(
      errorsFor(monitoringResultSchema.safeParse({ ...BARIS, ngCount: "-1" }), "ngCount"),
    ).toHaveLength(1);
    expect(
      errorsFor(monitoringResultSchema.safeParse({ ...BARIS, quantity: "1.5" }), "quantity"),
    ).toHaveLength(1);
  });

  it("menolak tanggal yang kosong atau tidak terbaca", () => {
    expect(
      errorsFor(monitoringResultSchema.safeParse({ ...BARIS, recordedOn: "" }), "recordedOn"),
    ).toHaveLength(1);
    expect(
      errorsFor(monitoringResultSchema.safeParse({ ...BARIS, recordedOn: "kemarin" }), "recordedOn"),
    ).toHaveLength(1);
  });

  it("menolak jenis pencatatan yang tidak dikenal", () => {
    expect(monitoringResultSchema.safeParse({ ...BARIS, kind: "AUDIT" }).success).toBe(false);
  });
});
