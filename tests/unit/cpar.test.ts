import { describe, expect, it } from "vitest";

import type { CparSectionKey, RoleCode } from "@/generated/prisma/enums";
import {
  SECTION_LABEL,
  SECTION_ORDER,
  type CparForVerification,
  type SectionState,
  type VerificationRecord,
  isDerivedSection,
  isRetiredSection,
  isSectionFilled,
  missingRequiredSections,
  missingSectionLabels,
  requiredVerifiers,
  verificationProgress,
  verifierCapacity,
  verifierCapacities,
  missingEvidenceLabels,
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
  PERMANENT_COUNTERMEASURE: {
    items: [{ action: "Mengganti seal regulator", picId: "user-1" }],
  },
  STANDARDIZATION_HORIZONTAL: {
    items: [{ action: "WI-PRD-014 direvisi ke rev. 3", picId: "user-1" }],
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
      sections({ ROOT_CAUSE_OUTFLOW: null, STANDARDIZATION_HORIZONTAL: null }),
    );

    expect(result).toEqual(["ROOT_CAUSE_OUTFLOW", "STANDARDIZATION_HORIZONTAL"]);
  });

  it("memperlakukan isi yang hanya spasi sebagai kosong", () => {
    // Diuji pada `isSectionFilled` langsung, bukan lewat `sections()`: seluruh section
    // yang masih diisi kini berbentuk tabel, sehingga jalur paragraf tidak lagi dapat
    // dicapai dari SECTION_ORDER. Aturannya tetap berlaku — ia yang akan dipakai section
    // paragraf berikutnya — dan tanpa pengujian ini aturan itu hilang tanpa ada yang tahu.
    const paragraph = (content: string) => ({
      key: "EFFECTIVENESS_PLAN" as CparSectionKey,
      content,
      data: undefined,
    });

    expect(isSectionFilled(paragraph("   \n\t  "))).toBe(false);
    expect(isSectionFilled(paragraph("Isi yang memadai untuk section ini."))).toBe(true);
  });

  it("tidak menuntut section yang sudah dicabut, walau barisnya masih wajib dan kosong", () => {
    // Effectiveness plan tidak lagi punya tempat mengisinya, tetapi barisnya masih ada di
    // CPAR lama dengan isRequired menyala. Menghitungnya akan menahan submit atas tuntutan
    // yang mustahil dipenuhi — dan mustahil pula dijelaskan kepada yang menekan tombolnya.
    expect(isRetiredSection("EFFECTIVENESS_PLAN")).toBe(true);

    const withRetired: SectionState[] = [
      ...sections(),
      { key: "EFFECTIVENESS_PLAN", content: null, isRequired: true, data: undefined },
    ];

    expect(missingRequiredSections(withRetired)).toEqual([]);
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
});

/**
 * Kebuntuan yang pernah terjadi di produksi, diikat di sini.
 *
 * Dua cacat yang bergabung: (1) kapasitas User Dept. Head disimpulkan dari role, sehingga
 * CPAR yang penanggung jawabnya QA — departemen yang tidak punya satu pun pemegang role
 * USER_HEAD — berhenti selamanya pada tiga dari empat keputusan; dan (2) orang yang
 * memegang dua kapasitas hanya dapat memakai yang pertama, karena helper-nya
 * mengembalikan satu nilai.
 */
describe("verifierCapacities", () => {
  const QA_DEPT = "dept-qa";

  const rina = { id: "user-rina", roles: ["QA", "QA_HEAD"] as const, departmentId: QA_DEPT };

  it("mengembalikan kedua kapasitas saat QA menjadi main responsible department", () => {
    const cpar: CparForVerification = {
      responsibilityType: "CFT",
      responsibleDeptId: QA_DEPT,
      userHeadVerifierId: rina.id,
    };

    expect(verifierCapacities(rina, cpar)).toEqual(["QA_HEAD", "USER_HEAD"]);
  });

  it("memisahkan penunjukan dari role: yang ditunjuk memegang USER_HEAD tanpa role itu", () => {
    const cpar: CparForVerification = {
      responsibilityType: "USER_DEPT",
      responsibleDeptId: LEAD_DEPT,
      userHeadVerifierId: "user-budi",
    };

    const budi = { id: "user-budi", roles: ["USER_DEPT"] as const, departmentId: LEAD_DEPT };

    expect(verifierCapacities(budi, cpar)).toEqual(["USER_HEAD"]);
  });

  it("penunjukan mengalahkan role: pemegang USER_HEAD lain tidak ikut memutuskan", () => {
    const cpar: CparForVerification = {
      responsibilityType: "USER_DEPT",
      responsibleDeptId: LEAD_DEPT,
      userHeadVerifierId: "user-budi",
    };

    const bambang = { id: "user-bambang", roles: ["USER_HEAD"] as const, departmentId: LEAD_DEPT };

    expect(verifierCapacities(bambang, cpar)).toEqual([]);
  });

  it("tanpa penunjukan, aturan lama tetap berlaku untuk CPAR yang terbit lebih dulu", () => {
    const cpar: CparForVerification = {
      responsibilityType: "USER_DEPT",
      responsibleDeptId: LEAD_DEPT,
      userHeadVerifierId: null,
    };

    const bambang = { id: "user-bambang", roles: ["USER_HEAD"] as const, departmentId: LEAD_DEPT };
    const asing = { id: "user-asing", roles: ["USER_HEAD"] as const, departmentId: OTHER_DEPT };

    expect(verifierCapacities(bambang, cpar)).toEqual(["USER_HEAD"]);
    expect(verifierCapacities(asing, cpar)).toEqual([]);
  });

  it("mengembalikan kapasitas dalam urutan verifier wajib, bukan urutan role aktor", () => {
    const cpar: CparForVerification = {
      responsibilityType: "CFT",
      responsibleDeptId: QA_DEPT,
      userHeadVerifierId: rina.id,
    };

    const held = verifierCapacities({ ...rina, roles: ["QA_HEAD", "QA"] as const }, cpar);

    expect(held).toEqual(requiredVerifiers().filter((role) => held.includes(role)));
  });

  it("mengabaikan USER_HEAD yang tidak berhak tetapi tetap memakai kapasitas lain", () => {
    // Factory Manager yang juga head dept lain tetap memutuskan sebagai FACTORY_MGR.
    expect(verifierCapacity(["USER_HEAD", "FACTORY_MGR"], OTHER_DEPT, USER_DEPT_CPAR)).toBe(
      "FACTORY_MGR",
    );
  });
});

/**
 * Siapa yang mengisi kapasitas "User Dept. Head" pada rantai verifikasi.
 *
 * Diuji terpisah dari `can()` karena keduanya memang berbeda lebar, dan selisihnya
 * sempat membingungkan di lapangan: `can(user, "cpar.verify")` memakai cakupan DEPT yang
 * ikut mencakup anggota CFT, sedangkan kapasitas verifier hanya diberikan kepada head
 * departemen penanggung jawab (asumsi A-04). Head departemen anggota CFT karena itu lolos
 * penjaga izin tetapi tetap tidak memperoleh kapasitas — dan server action menolaknya di
 * lapis kedua. Pasangan uji ini yang menjaga selisih itu tetap disengaja.
 */
describe("verifierCapacity — kapasitas User Dept. Head", () => {
  // Bertipe CFT: Production memimpin, Engineering dan Maintenance ikut sebagai anggota.
  const cpar: CparForVerification = { responsibilityType: "CFT", responsibleDeptId: "d-prd" };

  it("memberi kapasitas kepada head departemen penanggung jawab", () => {
    expect(verifierCapacity(["USER_HEAD", "USER_DEPT"], "d-prd", cpar)).toBe("USER_HEAD");
  });

  it("menolak head departemen anggota CFT — hanya lead dept yang wajib memutuskan", () => {
    expect(verifierCapacity(["USER_HEAD", "USER_DEPT"], "d-eng", cpar)).toBeNull();
  });

  it("menolak head departemen yang tidak terlibat sama sekali", () => {
    expect(verifierCapacity(["USER_HEAD"], "d-pur", cpar)).toBeNull();
  });

  it("menolak head tanpa departemen", () => {
    expect(verifierCapacity(["USER_HEAD"], null, cpar)).toBeNull();
  });

  it("tidak terpengaruh departemen untuk kapasitas yang berlaku menyeluruh", () => {
    expect(verifierCapacity(["QA_HEAD"], null, cpar)).toBe("QA_HEAD");
    expect(verifierCapacity(["FACTORY_MGR"], "d-eng", cpar)).toBe("FACTORY_MGR");
    expect(verifierCapacity(["PRESDIR"], null, cpar)).toBe("PRESDIR");
  });

  it("mengembalikan kapasitas pertama menurut urutan verifier wajib bila role rangkap", () => {
    // Rina memegang QA_HEAD sekaligus QA; yang mengisi rantai adalah QA_HEAD.
    expect(verifierCapacity(["QA", "QA_HEAD"], "d-qa", cpar)).toBe("QA_HEAD");
  });
});

/**
 * Gerbang evidence pada submit final.
 *
 * Aturannya: CPAR tidak dapat dikirim ke verifikasi selama masih ada kotak evidence
 * yang kosong. Verifier menilai "tindakan ini sudah dikerjakan" dari buktinya; tanpa
 * berkas, yang dinilai hanya janji.
 */
describe("missingEvidenceLabels", () => {
  const slot = (title: string, fileCount: number, sectionLabel = "Permanent countermeasure") => ({
    sectionLabel,
    title,
    fileCount,
  });

  it("melewatkan CPAR yang seluruh evidence-nya sudah dilampirkan", () => {
    expect(
      missingEvidenceLabels([slot("Pasang poka-yoke", 1), slot("Revisi WI", 3)]),
    ).toEqual([]);
  });

  it("tidak menahan CPAR yang memang tidak meminta evidence apa pun", () => {
    expect(missingEvidenceLabels([])).toEqual([]);
  });

  it("menyebut bagian dan judulnya, bukan sekadar jumlahnya", () => {
    // Daftar yang hanya berbunyi "3 evidence kurang" memaksa orang mencari sendiri
    // yang mana; yang dicari justru barisnya.
    expect(
      missingEvidenceLabels([
        slot("4M Change Sheet", 0, "Initial Document Request"),
        slot("Pasang poka-yoke", 1),
        slot("Revisi WI-PRD-014", 0, "Standardization & horizontal deployment"),
      ]),
    ).toEqual([
      "Initial Document Request — 4M Change Sheet",
      "Standardization & horizontal deployment — Revisi WI-PRD-014",
    ]);
  });

  it("memotong judul yang terlalu panjang", () => {
    const [label] = missingEvidenceLabels([slot("A".repeat(100), 0)]);

    // Yang dibatasi judulnya, bukan seluruh kalimat: nama bagian di depan punya
    // panjangnya sendiri dan memang harus tetap utuh.
    const title = label.split(" — ")[1];

    expect(title).toHaveLength(58); // 57 karakter + elipsis
    expect(title.endsWith("…")).toBe(true);
  });

  it("tetap menyebut baris yang judulnya kosong", () => {
    expect(missingEvidenceLabels([slot("   ", 0)])).toEqual([
      "Permanent countermeasure — (tanpa judul)",
    ]);
  });
});
