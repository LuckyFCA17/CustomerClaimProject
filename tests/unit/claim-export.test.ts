import { describe, expect, it } from "vitest";

import { parseClaimQuery } from "@/lib/claim-filters";
import {
  EXPORT_COLUMNS,
  EXPORT_ROW_MAX,
  type ExportableClaim,
  describeFilter,
  exportFileName,
  toExportRow,
} from "@/lib/claim-export";

/**
 * Berkas ekspor berpindah tangan: ia dibuka orang yang tidak melihat layar yang
 * menghasilkannya. Yang diuji di sini adalah apa yang terbaca dari berkasnya sendiri —
 * penyaring yang berlaku, dan nilai kosong yang tidak merusak pengurutan di Excel.
 */

const claim: ExportableClaim = {
  claimNo: "NID/CC/26/10/0005",
  status: "PUBLISHED",
  type: "OFFICIAL",
  dateOfOccurrence: new Date("2026-10-18T00:00:00.000Z"),
  dateOfReceived: null,
  problemOrigin: "EXTERNAL",
  occurrence: "FIRST_TIME",
  partName: "Clip Fastener Bumper",
  internalPartNo: "NID-4451-02",
  customerPartNo: "90467-09201",
  lotNo: "LOT-26-0705",
  kanbanNo: "",
  qualityProblem: "Clip patah pada kaki pengunci.",
  customerName: "PT Toyota Motor Manufacturing Indonesia",
  ncDetail: "Crack / Broken",
  productCategory: "Critical Part",
  createdByName: "Dimas Prayoga",
  createdAt: new Date("2026-10-20T03:00:00.000Z"),
  submittedAt: null,
  publishedAt: null,
  cparNo: null,
  responsibleDept: null,
  cparCycle: null,
  cparDueDate: null,
  cparSubmittedAt: null,
  cparApprovedAt: null,
};

describe("kolom ekspor", () => {
  it("menulis tanggal sebagai Date, bukan teks", () => {
    // Tanggal yang berubah menjadi teks berhenti dapat diurutkan di Excel — dan
    // mengurutkan adalah alasan orang membuka berkasnya.
    const row = toExportRow(claim);
    const index = EXPORT_COLUMNS.findIndex((column) => column.header === "Tanggal kejadian");

    expect(row[index]).toBeInstanceOf(Date);
  });

  it("menulis nilai kosong sebagai sel kosong, bukan tanda hubung", () => {
    const row = toExportRow(claim);
    const kanban = EXPORT_COLUMNS.findIndex((column) => column.header === "Kanban no.");
    const diterima = EXPORT_COLUMNS.findIndex((column) => column.header === "Tanggal diterima");

    expect(row[kanban]).toBeNull();
    expect(row[diterima]).toBeNull();
  });

  it("menerjemahkan kode menjadi label yang terbaca manusia", () => {
    const row = toExportRow(claim);
    const at = (header: string) =>
      row[EXPORT_COLUMNS.findIndex((column) => column.header === header)];

    expect(at("Status")).toBe("Published");
    expect(at("Jenis klaim")).toBe("Official");
    expect(at("Asal masalah")).toBe("External");
    expect(at("Occurrence")).toBe("First Time");
  });

  it("memuat kolom CPAR walau klaimnya belum punya CPAR", () => {
    const headers = EXPORT_COLUMNS.map((column) => column.header);

    expect(headers).toContain("CPAR No.");
    expect(headers).toContain("Siklus CPAR");
    expect(toExportRow(claim)).toHaveLength(EXPORT_COLUMNS.length);
  });

  it("tiap kolom punya judul yang tidak kembar", () => {
    const headers = EXPORT_COLUMNS.map((column) => column.header);

    expect(new Set(headers).size).toBe(headers.length);
  });

  it("membatasi jumlah baris satu berkas", () => {
    expect(EXPORT_ROW_MAX).toBeGreaterThan(1000);
    expect(EXPORT_ROW_MAX).toBeLessThanOrEqual(20000);
  });
});

describe("exportFileName", () => {
  const now = new Date("2026-11-02T01:00:00.000Z");

  it("memuat tanggal supaya berkas kelima dapat dibedakan dari yang pertama", () => {
    expect(exportFileName(parseClaimQuery({}), now)).toBe("NCC-claims-2026-11-02.xlsx");
  });

  it("menandai berkas yang isinya tersaring", () => {
    const query = parseClaimQuery({ status: "PUBLISHED" });

    expect(exportFileName(query, now)).toBe("NCC-claims-2026-11-02-tersaring.xlsx");
  });

  it("urutan dan ukuran halaman tidak membuatnya disebut tersaring", () => {
    const query = parseClaimQuery({ sort: "part-asc", per: "50" });

    expect(exportFileName(query, now)).toBe("NCC-claims-2026-11-02.xlsx");
  });
});

describe("describeFilter", () => {
  it("menyebut penyaring yang sedang berlaku", () => {
    const query = parseClaimQuery({
      q: "clip",
      status: "PUBLISHED",
      type: "OFFICIAL",
      from: "2026-10-01",
    });
    const text = describeFilter(query);

    expect(text).toContain("clip");
    expect(text).toContain("Published");
    expect(text).toContain("Official");
    expect(text).toContain("2026-10-01");
  });

  it("menyatakan apa adanya ketika tidak ada penyaring", () => {
    expect(describeFilter(parseClaimQuery({}))).toBe("Tanpa penyaring");
  });
});
