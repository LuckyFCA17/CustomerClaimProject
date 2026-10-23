import { describe, expect, it } from "vitest";

import {
  TERMINAL_STATUSES,
  TRANSITIONS,
  assertTransition,
  availableTransitions,
  findTransition,
  isTerminal,
  transitionsFrom,
} from "@/lib/claim-state";
import { IllegalTransitionError } from "@/lib/errors";
import { ACTIONS } from "@/lib/permissions";
import { ClaimStatus, RoleCode } from "@/generated/prisma/enums";

const ALL_STATUSES = Object.values(ClaimStatus);
const ALL_ROLES = Object.values(RoleCode);

/** Diagram §5 dituliskan ulang di sini, lepas dari implementasinya. */
const EXPECTED_EDGES: ReadonlyArray<readonly [ClaimStatus, ClaimStatus]> = [
  ["DRAFT", "PENDING_QA_HEAD_REVIEW"],
  ["REVISION_REQUESTED", "PENDING_QA_HEAD_REVIEW"],
  ["PENDING_QA_HEAD_REVIEW", "REVISION_REQUESTED"],
  ["PENDING_QA_HEAD_REVIEW", "PUBLISHED"],
  ["PUBLISHED", "CPAR_ISSUED"],
  ["PUBLISHED", "IGNORED"],
  ["CPAR_ISSUED", "CPAR_IN_PROGRESS"],
  ["CPAR_IN_PROGRESS", "CPAR_UNDER_VERIFICATION"],
  ["CPAR_REVISION", "CPAR_UNDER_VERIFICATION"],
  ["CPAR_UNDER_VERIFICATION", "CPAR_REVISION"],
  ["CPAR_UNDER_VERIFICATION", "CPAR_APPROVED"],
  ["CPAR_APPROVED", "CAPA_MONITORING"],
  ["CAPA_MONITORING", "CPAR_REVISION"],
  ["CAPA_MONITORING", "VERIFIED_CLOSED"],
];

const edgeKey = (from: string, to: string) => `${from}→${to}`;

describe("bentuk tabel transisi", () => {
  it("memuat persis perpindahan pada diagram §5 — tidak kurang, tidak lebih", () => {
    const actual = TRANSITIONS.map((entry) => edgeKey(entry.from, entry.to)).sort();
    const expected = EXPECTED_EDGES.map(([from, to]) => edgeKey(from, to)).sort();

    expect(actual).toEqual(expected);
  });

  it("tidak memuat perpindahan ganda untuk pasangan status yang sama", () => {
    const keys = TRANSITIONS.map((entry) => edgeKey(entry.from, entry.to));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("memakai aksi yang ada di matriks izin", () => {
    for (const entry of TRANSITIONS) {
      expect(ACTIONS, edgeKey(entry.from, entry.to)).toContain(entry.action);
    }
  });

  it("memberi setiap perpindahan setidaknya satu kapasitas dan label kata kerja", () => {
    for (const entry of TRANSITIONS) {
      expect(entry.roles.length, edgeKey(entry.from, entry.to)).toBeGreaterThan(0);
      expect(entry.label.length, edgeKey(entry.from, entry.to)).toBeGreaterThan(0);

      for (const role of entry.roles) {
        expect(ALL_ROLES, `${edgeKey(entry.from, entry.to)} → ${role}`).toContain(role);
      }
    }
  });

  it("menutup kedua status terminal dan membuka semua status lain", () => {
    expect([...TERMINAL_STATUSES]).toEqual(["IGNORED", "VERIFIED_CLOSED"]);

    for (const status of ALL_STATUSES) {
      const outgoing = transitionsFrom(status);

      if (isTerminal(status)) {
        expect(outgoing, status).toHaveLength(0);
      } else {
        expect(outgoing.length, status).toBeGreaterThan(0);
      }
    }
  });

  it("dapat dicapai dari DRAFT — tidak ada status yatim", () => {
    const reachable = new Set<ClaimStatus>(["DRAFT"]);
    let grew = true;

    while (grew) {
      grew = false;
      for (const entry of TRANSITIONS) {
        if (reachable.has(entry.from) && !reachable.has(entry.to)) {
          reachable.add(entry.to);
          grew = true;
        }
      }
    }

    for (const status of ALL_STATUSES) {
      expect(reachable.has(status), status).toBe(true);
    }
  });
});

describe("assertTransition menerima perpindahan yang sah", () => {
  it.each(TRANSITIONS.map((entry) => [edgeKey(entry.from, entry.to), entry] as const))(
    "%s",
    (_label, entry) => {
      for (const role of entry.roles) {
        expect(assertTransition(entry.from, entry.to, [role])).toBe(entry);
      }
    },
  );

  it("menerima pengguna rangkap jabatan selama salah satu rolenya berwenang", () => {
    const transition = assertTransition("PENDING_QA_HEAD_REVIEW", "PUBLISHED", ["QA", "QA_HEAD"]);
    expect(transition.label).toBe("Approve claim");
  });
});

describe("assertTransition menolak yang tidak sah (kriteria penerimaan #3)", () => {
  const legal = new Set(EXPECTED_EDGES.map(([from, to]) => edgeKey(from, to)));

  it("menolak seluruh pasangan status yang tidak ada di tabel", () => {
    let checked = 0;

    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        if (legal.has(edgeKey(from, to))) continue;

        checked += 1;
        expect(
          () => assertTransition(from, to, ALL_ROLES),
          `${edgeKey(from, to)} seharusnya ditolak`,
        ).toThrow(IllegalTransitionError);
      }
    }

    // 12 status → 144 pasangan, 14 di antaranya sah.
    expect(checked).toBe(ALL_STATUSES.length * ALL_STATUSES.length - EXPECTED_EDGES.length);
  });

  it("menolak lompatan yang paling menggoda di lapangan", () => {
    const jumps: ReadonlyArray<readonly [ClaimStatus, ClaimStatus]> = [
      ["DRAFT", "PUBLISHED"],
      ["DRAFT", "VERIFIED_CLOSED"],
      ["PENDING_QA_HEAD_REVIEW", "CPAR_ISSUED"],
      ["PUBLISHED", "CPAR_APPROVED"],
      ["CPAR_ISSUED", "CPAR_APPROVED"],
      ["CPAR_IN_PROGRESS", "CPAR_APPROVED"],
      ["CPAR_APPROVED", "VERIFIED_CLOSED"],
      ["CAPA_MONITORING", "CPAR_APPROVED"],
    ];

    for (const [from, to] of jumps) {
      expect(() => assertTransition(from, to, ALL_ROLES), edgeKey(from, to)).toThrow(
        IllegalTransitionError,
      );
    }
  });

  it("menolak perpindahan keluar dari status terminal", () => {
    for (const from of TERMINAL_STATUSES) {
      for (const to of ALL_STATUSES) {
        expect(() => assertTransition(from, to, ALL_ROLES), edgeKey(from, to)).toThrow(
          IllegalTransitionError,
        );
      }
    }
  });

  it("menolak status yang tidak berubah", () => {
    for (const status of ALL_STATUSES) {
      expect(() => assertTransition(status, status, ALL_ROLES), status).toThrow(
        IllegalTransitionError,
      );
    }
  });

  it("menolak perpindahan sah yang dipicu kapasitas yang salah", () => {
    for (const entry of TRANSITIONS) {
      const outsiders = ALL_ROLES.filter((role) => !entry.roles.includes(role));

      expect(
        () => assertTransition(entry.from, entry.to, outsiders),
        `${edgeKey(entry.from, entry.to)} oleh ${outsiders.join(",")}`,
      ).toThrow(IllegalTransitionError);
    }
  });

  it("menolak pemanggil tanpa role sama sekali", () => {
    expect(() => assertTransition("DRAFT", "PENDING_QA_HEAD_REVIEW", [])).toThrow(
      IllegalTransitionError,
    );
  });

  it("menjelaskan sebabnya pada pesan galat", () => {
    expect(() => assertTransition("DRAFT", "PUBLISHED", ALL_ROLES)).toThrow(
      /DRAFT ke PUBLISHED tidak diizinkan/,
    );

    expect(() => assertTransition("DRAFT", "PENDING_QA_HEAD_REVIEW", ["USER_DEPT"])).toThrow(
      /tidak berwenang/,
    );

    expect(() => assertTransition("IGNORED", "CPAR_ISSUED", ALL_ROLES)).toThrow(
      /sudah berstatus IGNORED/,
    );
  });
});

describe("tombol aksi yang muncul", () => {
  it("memberi QA dua pilihan pada klaim terbit — follow up atau ignore", () => {
    const labels = availableTransitions("PUBLISHED", ["QA"]).map((entry) => entry.label);

    expect(labels).toEqual([
      "Submit problem countermeasure request",
      "Ignore claim",
    ]);
  });

  it("tidak memberi pilihan apa pun kepada departemen pengguna pada klaim terbit", () => {
    expect(availableTransitions("PUBLISHED", ["USER_DEPT"])).toHaveLength(0);
  });

  it("memberi QA Head dua keputusan review", () => {
    const labels = availableTransitions("PENDING_QA_HEAD_REVIEW", ["QA_HEAD"]).map((e) => e.label);

    expect(labels.sort()).toEqual(["Approve claim", "Request revision"]);
  });

  it("tidak memberi pilihan apa pun pada klaim yang sudah ditutup", () => {
    for (const status of TERMINAL_STATUSES) {
      expect(availableTransitions(status, ALL_ROLES), status).toHaveLength(0);
    }
  });

  it("membuka kembali pengisian CPAR setelah revisi", () => {
    const labels = availableTransitions("CPAR_REVISION", ["QA"]).map((entry) => entry.label);
    expect(labels).toContain("Submit CPAR final report");
  });
});

describe("findTransition", () => {
  it("menemukan perpindahan yang ada dan mengembalikan undefined untuk yang tidak ada", () => {
    expect(findTransition("DRAFT", "PENDING_QA_HEAD_REVIEW")?.action).toBe("claim.submit");
    expect(findTransition("DRAFT", "CAPA_MONITORING")).toBeUndefined();
  });
});
