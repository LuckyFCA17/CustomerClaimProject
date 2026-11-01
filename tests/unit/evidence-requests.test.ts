import { describe, expect, it } from "vitest";

import {
  DEFAULT_EVIDENCE_SORT,
  EVIDENCE_PREFIX,
  EVIDENCE_SORT_KEYS,
  type EvidenceRequestRow,
  completionOf,
  evidenceParams,
  filterEvidenceRows,
  hasActiveEvidenceFilter,
  parseEvidenceQuery,
  sortEvidenceRows,
  tallyEvidence,
} from "@/lib/evidence-requests";

/**
 * Tabel permintaan evidence adalah daftar pekerjaan, dan daftar pekerjaan yang salah
 * menandai "sudah" atau "lewat tenggat" lebih buruk daripada tidak ada daftar sama
 * sekali. Yang diuji di sini: dari mana kedua tanda itu disimpulkan, dan bahwa
 * penyaring kedua tabel di satu halaman tidak saling mengganggu.
 */

const NOW = new Date("2026-11-01T00:00:00.000Z");

function row(overrides: Partial<EvidenceRequestRow> = {}): EvidenceRequestRow {
  return {
    key: "k",
    kind: "ACTION_ITEM",
    claimId: "claim-1",
    claimNo: "NID/CC/26/10/0002",
    cparNo: "NID/CPAR/26/0001",
    sectionLabel: "Permanent countermeasure",
    title: "Mengganti seal regulator",
    picId: "user-yusuf",
    picName: "Yusuf Ramadhan",
    dueDate: new Date("2026-11-14T00:00:00.000Z"),
    fileCount: 0,
    targetId: "item-1",
    canUpload: true,
    ...overrides,
  };
}

describe("completionOf", () => {
  it("terpenuhi ditentukan dari ada tidaknya berkas, bukan dari centang", () => {
    expect(completionOf(row({ fileCount: 1 }), NOW)).toBe("DONE");
    expect(completionOf(row({ fileCount: 0 }), NOW)).toBe("PENDING");
  });

  it("lewat tenggat hanya berlaku bagi yang belum terpenuhi", () => {
    const late = new Date("2026-10-01T00:00:00.000Z");

    expect(completionOf(row({ dueDate: late }), NOW)).toBe("OVERDUE");
    // Yang sudah dilampirkan tidak lagi menagih apa pun, walau tanggalnya sudah lewat.
    expect(completionOf(row({ dueDate: late, fileCount: 2 }), NOW)).toBe("DONE");
  });

  it("baris tanpa tenggat tidak pernah terbaca lewat tenggat", () => {
    expect(completionOf(row({ dueDate: null }), NOW)).toBe("PENDING");
  });
});

describe("parseEvidenceQuery", () => {
  it("memakai awalan sendiri supaya tidak bertabrakan dengan penyaring daftar CPAR", () => {
    expect(EVIDENCE_PREFIX).toBe("e_");

    const query = parseEvidenceQuery({
      status: "PUBLISHED",
      from: "2026-01-01",
      e_status: "OVERDUE",
      e_from: "2026-11-01",
      e_per: "10",
      e_mine: "1",
    });

    expect(query.status).toBe("OVERDUE");
    expect(query.from).toBe("2026-11-01");
    expect(query.perPage).toBe(10);
    expect(query.mine).toBe(true);
  });

  it("mengabaikan nilai yang tidak dikenal", () => {
    const query = parseEvidenceQuery({
      e_status: "HAMPIR",
      e_sort: "entah",
      e_per: "7",
      e_page: "0",
      e_from: "besok",
    });

    expect(query.status).toBeNull();
    expect(query.sort).toBe(DEFAULT_EVIDENCE_SORT);
    expect(query.perPage).toBe(25);
    expect(query.page).toBe(1);
    expect(query.from).toBeNull();
  });

  it("membetulkan rentang tenggat yang terbalik", () => {
    const query = parseEvidenceQuery({ e_from: "2026-12-31", e_to: "2026-11-01" });

    expect([query.from, query.to]).toEqual(["2026-11-01", "2026-12-31"]);
  });

  it("menandai penyaring aktif, tetapi tidak untuk urutan dan ukuran halaman", () => {
    expect(hasActiveEvidenceFilter(parseEvidenceQuery({ e_status: "DONE" }))).toBe(true);
    expect(hasActiveEvidenceFilter(parseEvidenceQuery({ e_mine: "1" }))).toBe(true);
    expect(hasActiveEvidenceFilter(parseEvidenceQuery({ e_sort: "due-desc", e_per: "50" }))).toBe(
      false,
    );
  });
});

describe("filterEvidenceRows", () => {
  const rows = [
    row({ key: "a", picId: "user-yusuf", dueDate: new Date("2026-10-01T00:00:00.000Z") }),
    row({ key: "b", picId: "user-agus", fileCount: 1 }),
    row({ key: "c", picId: "user-yusuf", dueDate: null }),
  ];

  const keys = (query: Parameters<typeof filterEvidenceRows>[1]) =>
    filterEvidenceRows(rows, query, "user-yusuf", NOW).map((entry) => entry.key);

  it("menyaring menurut status penyelesaian", () => {
    expect(keys(parseEvidenceQuery({ e_status: "OVERDUE" }))).toEqual(["a"]);
    expect(keys(parseEvidenceQuery({ e_status: "DONE" }))).toEqual(["b"]);
    expect(keys(parseEvidenceQuery({ e_status: "PENDING" }))).toEqual(["c"]);
  });

  it("menyaring menurut rentang tenggat", () => {
    expect(keys(parseEvidenceQuery({ e_from: "2026-11-01" }))).toEqual(["b"]);
    expect(keys(parseEvidenceQuery({ e_to: "2026-10-31" }))).toEqual(["a"]);
  });

  it("membuang baris tanpa tenggat ketika rentang dipasang", () => {
    // Rentang tanggal adalah pertanyaan tentang tenggat; baris tanpa tenggat bukan
    // jawaban atasnya, dan menyelipkannya akan membuat hitungannya tidak masuk akal.
    expect(keys(parseEvidenceQuery({ e_from: "2026-01-01", e_to: "2026-12-31" }))).toEqual([
      "a",
      "b",
    ]);
  });

  it("dapat dipersempit ke permintaan milik sendiri", () => {
    expect(keys(parseEvidenceQuery({ e_mine: "1" }))).toEqual(["a", "c"]);
  });
});

describe("sortEvidenceRows", () => {
  const rows = [
    row({ key: "tanpa", dueDate: null }),
    row({ key: "jauh", dueDate: new Date("2026-12-01T00:00:00.000Z") }),
    row({ key: "lewat", dueDate: new Date("2026-10-01T00:00:00.000Z") }),
  ];

  it("menaruh baris tanpa tenggat di akhir, baik menaik maupun menurun", () => {
    expect(sortEvidenceRows(rows, "due-asc", NOW).map((r) => r.key)).toEqual([
      "lewat",
      "jauh",
      "tanpa",
    ]);
    expect(sortEvidenceRows(rows, "due-desc", NOW).map((r) => r.key)).toEqual([
      "jauh",
      "lewat",
      "tanpa",
    ]);
  });

  it("mendahulukan yang lewat tenggat pada urutan status", () => {
    const withDone = [...rows, row({ key: "selesai", fileCount: 1, dueDate: null })];

    expect(sortEvidenceRows(withDone, "status-asc", NOW).map((r) => r.key)).toEqual([
      "lewat",
      "jauh",
      "tanpa",
      "selesai",
    ]);
  });

  it("tidak mengubah daftar aslinya", () => {
    const before = rows.map((r) => r.key);
    sortEvidenceRows(rows, "due-desc", NOW);

    expect(rows.map((r) => r.key)).toEqual(before);
  });

  it("menyediakan urutan tenggat dan status yang diminta", () => {
    expect(EVIDENCE_SORT_KEYS).toEqual(["due-asc", "due-desc", "status-asc", "cpar-asc"]);
  });
});

describe("tallyEvidence", () => {
  it("menghitung tiap baris tepat satu kali", () => {
    const tally = tallyEvidence(
      [
        row({ dueDate: new Date("2026-10-01T00:00:00.000Z") }),
        row({ fileCount: 1, dueDate: new Date("2026-10-01T00:00:00.000Z") }),
        row({ dueDate: null }),
      ],
      NOW,
    );

    expect(tally).toEqual({ total: 3, overdue: 1, done: 1, pending: 1 });
    expect(tally.overdue + tally.done + tally.pending).toBe(tally.total);
  });
});

describe("evidenceParams", () => {
  it("tidak menuliskan nilai bawaan", () => {
    expect(evidenceParams(parseEvidenceQuery({}))).toEqual({});
  });

  it("menulis dengan awalan sehingga dapat dititipkan pada form tabel sebelah", () => {
    const query = parseEvidenceQuery({ e_status: "OVERDUE", e_mine: "1", e_per: "10" });

    expect(evidenceParams(query, { page: 3 })).toEqual({
      e_status: "OVERDUE",
      e_mine: "1",
      e_per: "10",
      e_page: "3",
    });
  });

  it("dapat dibaca kembali menjadi penyaring yang sama", () => {
    const query = parseEvidenceQuery({
      e_status: "PENDING",
      e_from: "2026-11-01",
      e_to: "2026-12-31",
      e_sort: "cpar-asc",
      e_mine: "1",
      e_per: "50",
      e_page: "2",
    });

    expect(parseEvidenceQuery(evidenceParams(query))).toEqual(query);
  });
});
