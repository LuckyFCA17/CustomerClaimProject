import { describe, expect, it } from "vitest";

import type { CparSectionKey, RoleCode } from "@/generated/prisma/enums";
import {
  SECTION_LABEL,
  SECTION_ORDER,
  type CparForVerification,
  type SectionState,
  type VerificationRecord,
  isDerivedSection,
  missingRequiredSections,
  missingSectionLabels,
  requiredVerifiers,
  verificationProgress,
  verifierCapacity,
} from "@/lib/cpar";

/**
 * Aturan Modul 3 (§6) yang paling mahal bila salah: kelengkapan section menentukan
 * apakah CPAR boleh dikirim, dan rantai verifikasi menentukan kapan klaim boleh maju.
 * Keduanya diuji tanpa basis data supaya setiap cabang benar-benar terlewati.
 */

const LEAD_DEPT = "dept-production";
const OTHER_DEPT = "dept-engineering";

const USER_DEPT_CPAR: CparForVerification = {
  responsibilityType: "USER_DEPT",
  responsibleDeptId: LEAD_DEPT,
};

const CFT_CPAR: CparForVerification = {
  responsibilityType: "CFT",
  responsibleDeptId: LEAD_DEPT,
};

/**
 * Section tabel tidak terisi lewat paragraf, jadi helper ini memberi mereka isi
 * terstruktur yang setara. Mengosongkannya tetap dilakukan lewat `overrides`.
 */
const FILLED_DATA: Partial<Record<CparSectionKey, unknown>> = {
  TEMPORARY_ACTION: {
    entries: [{ kind: "REPLACEMENT", label: "Replacement part", totalPcs: 10 }],
  },
  PROCESS_FLOW: {
    steps: [
      { name: "Injection", suspectOccurrence: true, suspectOutflow: false },
      { name: "Final inspection", suspectOccurrence: false, suspectOutflow: true },
    ],
  },
  ROOT_CAUSE_OCCURRENCE: {
    factors: [{ category: "MACHINE", item: "Tekanan holding", judgement: "NG" }],
  },
  ROOT_CAUSE_OUTFLOW: {
    factors: [{ category: "METHOD", item: "Titik inspeksi", judgement: "NG" }],
  },
};

function sections(overrides: Partial<Record<CparSectionKey, string | null>> = {}): SectionState[] {
  return SECTION_ORDER.map((key) => {
    const emptied = key in overrides && overrides[key] === null;

    return {
      key,
      content: key in overrides ? (overrides[key] ?? null) : "Isi yang memadai untuk section ini.",
      isRequired: true,
      data: emptied ? undefined : FILLED_DATA[key],
    };
  });
}

describe("missingRequiredSections", () => {
  it("menganggap CPAR lengkap ketika seluruh section terisi", () => {
    expect(missingRequiredSections(sections())).toEqual([]);
  });

  it("menyebut section yang kosong", () => {
    const result = missingRequiredSections(
      sections({ ROOT_CAUSE_OUTFLOW: null, EFFECTIVENESS_PLAN: null }),
    );

    expect(result).toEqual(["ROOT_CAUSE_OUTFLOW", "EFFECTIVENESS_PLAN"]);
  });

  it("memperlakukan isi yang hanya spasi sebagai kosong", () => {
    // Pada section paragraf; section tabel terisi lewat barisnya, bukan lewat teks.
    expect(missingRequiredSections(sections({ PERMANENT_COUNTERMEASURE: "   \n\t  " }))).toEqual([
      "PERMANENT_COUNTERMEASURE",
    ]);
  });

  it("mengembalikan section dalam urutan form, bukan urutan masukan", () => {
    const shuffled = [...sections({ TEMPORARY_ACTION: null, PERMANENT_COUNTERMEASURE: null })]
      .reverse();

    expect(missingRequiredSections(shuffled)).toEqual([
      "TEMPORARY_ACTION",
      "PERMANENT_COUNTERMEASURE",
    ]);
  });

  it("tidak pernah menuntut section yang isinya diturunkan dari klaim", () => {
    // Problem description dibaca langsung dari klaim, jadi kolom content-nya memang
    // kosong. Menahan submit karenanya berarti menolak pekerjaan yang sudah selesai.
    expect(isDerivedSection("PROBLEM_DESCRIPTION")).toBe(true);
    expect(missingRequiredSections(sections({ PROBLEM_DESCRIPTION: null }))).toEqual([]);
  });

  it("tetap menuntut section lain walau yang diturunkan kosong", () => {
    const result = missingRequiredSections(
      sections({ PROBLEM_DESCRIPTION: null, ROOT_CAUSE_OUTFLOW: null }),
    );

    expect(result).toEqual(["ROOT_CAUSE_OUTFLOW"]);
  });

  it("melewati section yang tidak wajib", () => {
    const list = sections({ TEMPORARY_ACTION: null }).map((section) =>
      section.key === "TEMPORARY_ACTION" ? { ...section, isRequired: false } : section,
    );

    expect(missingRequiredSections(list)).toEqual([]);
  });

  it("memberi label yang terbaca manusia untuk pop-up", () => {
    expect(missingSectionLabels(sections({ ROOT_CAUSE_OCCURRENCE: null }))).toEqual([
      SECTION_LABEL.ROOT_CAUSE_OCCURRENCE,
    ]);
  });
});

describe("requiredVerifiers", () => {
  it("menuntut empat kapasitas", () => {
    expect(requiredVerifiers()).toEqual(["QA_HEAD", "USER_HEAD", "FACTORY_MGR", "PRESDIR"]);
  });
});

describe("verificationProgress", () => {
  const cycle = 2;

  function record(role: RoleCode, decision: "VERIFIED" | "REVISE", at = cycle): VerificationRecord {
    return { role, decision, cycle: at };
  }

  it("belum lengkap ketika baru sebagian memutuskan", () => {
    const progress = verificationProgress([record("QA_HEAD", "VERIFIED")], cycle);

    expect(progress.isComplete).toBe(false);
    expect(progress.verified).toEqual(["QA_HEAD"]);
    expect(progress.pending).toEqual(["USER_HEAD", "FACTORY_MGR", "PRESDIR"]);
  });

  it("lengkap hanya ketika keempat kapasitas menyatakan VERIFIED", () => {
    const progress = verificationProgress(
      [
        record("QA_HEAD", "VERIFIED"),
        record("USER_HEAD", "VERIFIED"),
        record("FACTORY_MGR", "VERIFIED"),
        record("PRESDIR", "VERIFIED"),
      ],
      cycle,
    );

    expect(progress.isComplete).toBe(true);
    expect(progress.pending).toEqual([]);
  });

  it("tidak menghitung VERIFIED dari siklus sebelumnya", () => {
    const progress = verificationProgress(
      [
        record("QA_HEAD", "VERIFIED", 1),
        record("USER_HEAD", "VERIFIED", 1),
        record("FACTORY_MGR", "VERIFIED", 1),
        record("PRESDIR", "VERIFIED", 1),
        record("QA_HEAD", "VERIFIED"),
      ],
      cycle,
    );

    expect(progress.isComplete).toBe(false);
    expect(progress.verified).toEqual(["QA_HEAD"]);
  });

  it("menganggap REVISE sebagai sudah memutuskan, tetapi bukan sebagai setuju", () => {
    const progress = verificationProgress(
      [
        record("QA_HEAD", "VERIFIED"),
        record("USER_HEAD", "REVISE"),
        record("FACTORY_MGR", "VERIFIED"),
        record("PRESDIR", "VERIFIED"),
      ],
      cycle,
    );

    expect(progress.isComplete).toBe(false);
    expect(progress.verified).not.toContain("USER_HEAD");
    expect(progress.pending).not.toContain("USER_HEAD");
  });
});

describe("verifierCapacity", () => {
  it("memilih kapasitas sesuai urutan verifier wajib", () => {
    expect(verifierCapacity(["QA_HEAD", "QA"], "dept-qa", USER_DEPT_CPAR)).toBe("QA_HEAD");
  });

  it("menolak USER_HEAD dari departemen yang bukan penanggung jawab", () => {
    expect(verifierCapacity(["USER_HEAD"], OTHER_DEPT, USER_DEPT_CPAR)).toBeNull();
  });

  it("menerima USER_HEAD dari departemen penanggung jawab", () => {
    expect(verifierCapacity(["USER_HEAD"], LEAD_DEPT, USER_DEPT_CPAR)).toBe("USER_HEAD");
  });

  it("pada CFT hanya head lead dept yang menjadi verifier wajib (asumsi A-04)", () => {
    expect(verifierCapacity(["USER_HEAD"], LEAD_DEPT, CFT_CPAR)).toBe("USER_HEAD");
    expect(verifierCapacity(["USER_HEAD"], OTHER_DEPT, CFT_CPAR)).toBeNull();
  });

  it("menolak role yang tidak termasuk verifier wajib", () => {
    expect(verifierCapacity(["QA"], "dept-qa", USER_DEPT_CPAR)).toBeNull();
    expect(verifierCapacity(["ADMIN"], null, USER_DEPT_CPAR)).toBeNull();
    expect(verifierCapacity(["USER_DEPT"], LEAD_DEPT, USER_DEPT_CPAR)).toBeNull();
  });

  it("mengabaikan USER_HEAD yang tidak berhak tetapi tetap memakai kapasitas lain", () => {
    // Factory Manager yang juga head dept lain tetap memutuskan sebagai FACTORY_MGR.
    expect(verifierCapacity(["USER_HEAD", "FACTORY_MGR"], OTHER_DEPT, USER_DEPT_CPAR)).toBe(
      "FACTORY_MGR",
    );
  });
});
