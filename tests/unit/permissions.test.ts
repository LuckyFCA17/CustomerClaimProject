import { describe, expect, it } from "vitest";

import {
  ACTIONS,
  CPAR_SECTION_OWNERS,
  PERMISSION_MATRIX,
  REQUIRED_VERIFIER_ROLES,
  assertCan,
  can,
  canFillSection,
  canViewClaim,
  routeAllowed,
  visibleClaimsWhere,
  type Actor,
  type ClaimContext,
} from "@/lib/permissions";
import { ForbiddenError } from "@/lib/errors";
import { CparSectionKey, RoleCode } from "@/generated/prisma/enums";
import type { ClaimStatus } from "@/generated/prisma/enums";

const PRODUCTION = "dept-production";
const ENGINEERING = "dept-engineering";
const PURCHASING = "dept-purchasing";

const qa: Actor = { id: "u-qa", roles: ["QA"], departmentId: "dept-qa" };
const qaHead: Actor = { id: "u-qa-head", roles: ["QA_HEAD"], departmentId: "dept-qa" };
const admin: Actor = { id: "u-admin", roles: ["ADMIN"], departmentId: null };
const factoryMgr: Actor = { id: "u-fm", roles: ["FACTORY_MGR"], departmentId: null };
const presdir: Actor = { id: "u-pd", roles: ["PRESDIR"], departmentId: null };
const prodStaff: Actor = { id: "u-prd", roles: ["USER_DEPT"], departmentId: PRODUCTION };
const prodHead: Actor = { id: "u-prd-head", roles: ["USER_HEAD", "USER_DEPT"], departmentId: PRODUCTION };
const purchasingStaff: Actor = { id: "u-pur", roles: ["USER_DEPT"], departmentId: PURCHASING };

function claim(status: ClaimStatus, overrides: Partial<ClaimContext> = {}): ClaimContext {
  return {
    status,
    createdById: qa.id,
    cpar: null,
    ...overrides,
  };
}

/** Klaim yang CPAR-nya ditugaskan ke Production dengan Engineering sebagai anggota CFT. */
function cparClaim(status: ClaimStatus, overrides: Partial<ClaimContext> = {}): ClaimContext {
  return claim(status, {
    cpar: { responsibleDeptId: PRODUCTION, cftMemberDeptIds: [ENGINEERING] },
    ...overrides,
  });
}

describe("integritas matriks", () => {
  it("mendefinisikan aturan untuk setiap aksi, tanpa entri liar", () => {
    expect(Object.keys(PERMISSION_MATRIX).sort()).toEqual([...ACTIONS].sort());
  });

  it("hanya memakai kode role yang dikenal Prisma", () => {
    const known = new Set<string>(Object.values(RoleCode));

    for (const action of ACTIONS) {
      for (const role of Object.keys(PERMISSION_MATRIX[action].roles)) {
        expect(known.has(role), `${action} → ${role}`).toBe(true);
      }
    }
  });

  it("memberi pemilik untuk setiap section CPAR", () => {
    expect(Object.keys(CPAR_SECTION_OWNERS).sort()).toEqual(Object.values(CparSectionKey).sort());

    for (const [section, owners] of Object.entries(CPAR_SECTION_OWNERS)) {
      expect(owners.length, section).toBeGreaterThan(0);
    }
  });
});

describe("Modul 1 — informasi klaim", () => {
  it("hanya membiarkan QA pembuatnya menyunting dan mengirim draft", () => {
    const own = claim("DRAFT", { createdById: qa.id });
    const other = claim("DRAFT", { createdById: "u-qa-lain" });

    expect(can(qa, "claim.submit", own)).toBe(true);
    expect(can(qa, "claim.submit", other)).toBe(false);
    expect(can(qa, "claim.update", other)).toBe(false);
  });

  it("menolak penyuntingan setelah klaim terbit", () => {
    expect(can(qa, "claim.update", claim("PUBLISHED"))).toBe(false);
    expect(can(qa, "claim.update", claim("REVISION_REQUESTED"))).toBe(true);
  });

  it("membiarkan QA Head memutuskan hanya saat menunggu review", () => {
    expect(can(qaHead, "claim.review.approve", claim("PENDING_QA_HEAD_REVIEW"))).toBe(true);
    expect(can(qaHead, "claim.review.revise", claim("PENDING_QA_HEAD_REVIEW"))).toBe(true);
    expect(can(qaHead, "claim.review.approve", claim("DRAFT"))).toBe(false);
    expect(can(qaHead, "claim.review.approve", claim("PUBLISHED"))).toBe(false);
  });

  it("menutup approve klaim dan verifikasi CPAR bagi ADMIN (asumsi A-06)", () => {
    expect(can(admin, "claim.review.approve", claim("PENDING_QA_HEAD_REVIEW"))).toBe(false);
    expect(can(admin, "cpar.verify", cparClaim("CPAR_UNDER_VERIFICATION"))).toBe(false);
    expect(can(admin, "master.manage")).toBe(true);
  });

  /**
   * Menyunting klaim yang sudah terbit.
   *
   * Dipisahkan dari claim.update karena batas statusnya berbeda, dan batas itulah yang
   * menjaga tanda tangan di lembar CPAR tetap bermakna.
   */
  describe("claim.amend", () => {
    const ISSUED: ClaimStatus[] = ["PUBLISHED", "CPAR_ISSUED", "CPAR_IN_PROGRESS", "CPAR_REVISION"];

    it("membuka penyuntingan pada klaim terbit sampai sebelum verifikasi", () => {
      for (const status of ISSUED) {
        expect(can(qa, "claim.amend", claim(status)), status).toBe(true);
        expect(can(qaHead, "claim.amend", claim(status)), status).toBe(true);
        expect(can(admin, "claim.amend", claim(status)), status).toBe(true);
      }
    });

    it("menutupnya begitu verifikasi berjalan atau selesai", () => {
      // CPAR_UNDER_VERIFICATION: empat verifier sedang memutuskan atas isi yang
      // terpampang. CPAR_APPROVED dan sesudahnya: tanda tangan sudah diberikan atas
      // problem yang dinyatakan, dan mengubah pernyataan itu membuatnya menjaminkan
      // sesuatu yang tidak pernah dibaca penandatangannya.
      for (const status of [
        "CPAR_UNDER_VERIFICATION",
        "CPAR_APPROVED",
        "CAPA_MONITORING",
        "VERIFIED_CLOSED",
        "IGNORED",
      ] as ClaimStatus[]) {
        expect(can(qa, "claim.amend", claim(status)), status).toBe(false);
        expect(can(qaHead, "claim.amend", claim(status)), status).toBe(false);
        expect(can(admin, "claim.amend", claim(status)), status).toBe(false);
      }
    });

    it("tidak tumpang tindih dengan claim.update", () => {
      // Draft tetap jalur claim.update, dan klaim terbit tetap jalur claim.amend;
      // tidak ada status yang membuka keduanya sekaligus.
      for (const status of ["DRAFT", "REVISION_REQUESTED"] as ClaimStatus[]) {
        expect(can(qa, "claim.amend", claim(status)), status).toBe(false);
        expect(can(qa, "claim.update", claim(status)), status).toBe(true);
      }

      for (const status of ISSUED) {
        expect(can(qa, "claim.update", claim(status)), status).toBe(false);
      }
    });

    it("tetap milik pembuatnya untuk QA Staff, dan tertutup bagi departemen pelaksana", () => {
      const otherQa: Actor = { id: "u-qa-2", roles: ["QA"], departmentId: "dept-qa" };

      expect(can(otherQa, "claim.amend", claim("PUBLISHED"))).toBe(false);
      expect(can(prodHead, "claim.amend", claim("CPAR_IN_PROGRESS"))).toBe(false);
      expect(can(prodStaff, "claim.amend", claim("CPAR_IN_PROGRESS"))).toBe(false);
      expect(can(factoryMgr, "claim.amend", claim("PUBLISHED"))).toBe(false);
      expect(can(presdir, "claim.amend", claim("PUBLISHED"))).toBe(false);
    });
  });

  it("membuka Action Button A hanya pada klaim yang sudah terbit", () => {
    expect(can(qa, "claim.followUp", claim("PUBLISHED"))).toBe(true);
    expect(can(qa, "claim.ignore", claim("PUBLISHED"))).toBe(true);
    expect(can(qa, "claim.followUp", claim("PENDING_QA_HEAD_REVIEW"))).toBe(false);
    expect(can(qa, "claim.followUp", claim("CPAR_ISSUED"))).toBe(false);
  });
});

describe("Modul 3 — pengisian dan verifikasi CPAR", () => {
  it("membatasi pengisian pada departemen yang ditunjuk", () => {
    const target = cparClaim("CPAR_IN_PROGRESS");

    expect(can(prodStaff, "cpar.section.fill", target)).toBe(true);
    expect(can(purchasingStaff, "cpar.section.fill", target)).toBe(false);
  });

  it("mengikutsertakan anggota CFT, bukan hanya lead dept", () => {
    const target = cparClaim("CPAR_IN_PROGRESS");
    const engineer: Actor = { id: "u-eng", roles: ["USER_DEPT"], departmentId: ENGINEERING };

    expect(can(engineer, "cpar.section.fill", target)).toBe(true);
  });

  it("mengunci section sesuai pemiliknya (asumsi A-03)", () => {
    const target = cparClaim("CPAR_IN_PROGRESS");

    expect(canFillSection(prodStaff, "ROOT_CAUSE_OCCURRENCE", target)).toBe(true);
    expect(canFillSection(prodStaff, "PROBLEM_DESCRIPTION", target)).toBe(false);
    expect(canFillSection(qa, "PROBLEM_DESCRIPTION", target)).toBe(true);
    expect(canFillSection(prodHead, "EFFECTIVENESS_PLAN", target)).toBe(true);
    expect(canFillSection(prodStaff, "EFFECTIVENESS_PLAN", target)).toBe(false);
  });

  it("memberi QA Staff kewenangan melengkapi analisis dan tindak lanjutnya", () => {
    const target = cparClaim("CPAR_IN_PROGRESS");

    for (const section of [
      "ROOT_CAUSE_OCCURRENCE",
      "ROOT_CAUSE_OUTFLOW",
      "PERMANENT_COUNTERMEASURE",
      "STANDARDIZATION_HORIZONTAL",
    ] as const) {
      expect(canFillSection(qa, section, target), section).toBe(true);
      // Kewenangan QA menambah, bukan menggeser: departemen pelaksana tetap berhak.
      expect(canFillSection(prodStaff, section, target), section).toBe(true);
    }
  });

  it("tidak menjadikan QA Staff verifier walau ikut mengisi", () => {
    // Kalau tidak, orang yang sama dapat menulis analisis lalu menyetujuinya sendiri.
    expect(can(qa, "cpar.verify", cparClaim("CPAR_UNDER_VERIFICATION"))).toBe(false);
  });

  it("tidak memberi Factory Manager maupun PresDir section untuk diisi", () => {
    const target = cparClaim("CPAR_IN_PROGRESS");

    for (const section of Object.values(CparSectionKey)) {
      expect(canFillSection(factoryMgr, section, target), section).toBe(false);
      expect(canFillSection(presdir, section, target), section).toBe(false);
    }
  });

  it("menutup pengisian saat CPAR sedang diverifikasi, membukanya lagi saat revisi", () => {
    expect(can(prodStaff, "cpar.section.fill", cparClaim("CPAR_UNDER_VERIFICATION"))).toBe(false);
    expect(can(prodStaff, "cpar.section.fill", cparClaim("CPAR_REVISION"))).toBe(true);
  });

  it("membiarkan verifikasi hanya oleh empat kapasitas wajib", () => {
    const target = cparClaim("CPAR_UNDER_VERIFICATION");

    expect(can(qaHead, "cpar.verify", target)).toBe(true);
    expect(can(prodHead, "cpar.verify", target)).toBe(true);
    expect(can(factoryMgr, "cpar.verify", target)).toBe(true);
    expect(can(presdir, "cpar.verify", target)).toBe(true);

    expect(can(qa, "cpar.verify", target)).toBe(false);
    expect(can(prodStaff, "cpar.verify", target)).toBe(false);
  });

  it("tidak menjadikan head departemen lain sebagai verifier", () => {
    const otherHead: Actor = { id: "u-pur-head", roles: ["USER_HEAD"], departmentId: PURCHASING };

    expect(can(otherHead, "cpar.verify", cparClaim("CPAR_UNDER_VERIFICATION"))).toBe(false);
  });

  /**
   * Satu-satunya hak di portal ini yang tidak berasal dari role.
   *
   * Dibutuhkan karena ada departemen yang tidak punya satu pun pemegang role USER_HEAD —
   * dan CPAR yang penanggung jawabnya departemen itu tidak akan pernah mencapai empat
   * keputusan. Penunjukan dilakukan saat CPAR diterbitkan, bukan dengan membagikan role.
   */
  it("memberi hak verifikasi kepada orang yang ditunjuk, walau tidak memegang role verifier", () => {
    const ditunjuk: Actor = { id: "u-qa-lead", roles: ["USER_DEPT"], departmentId: PRODUCTION };
    const target = cparClaim("CPAR_UNDER_VERIFICATION", {
      cpar: {
        responsibleDeptId: PRODUCTION,
        cftMemberDeptIds: [ENGINEERING],
        userHeadVerifierId: ditunjuk.id,
      },
    });

    expect(can(ditunjuk, "cpar.verify", target)).toBe(true);

    // Penunjukan berlaku untuk satu CPAR, bukan untuk seluruh portal.
    expect(can(ditunjuk, "cpar.verify", cparClaim("CPAR_UNDER_VERIFICATION"))).toBe(false);
    expect(can(ditunjuk, "claim.review.approve", claim("PENDING_QA_HEAD_REVIEW"))).toBe(false);
    expect(can(ditunjuk, "master.manage")).toBe(false);
  });

  it("tidak menjadikan orang lain verifier hanya karena ada penunjukan pada CPAR itu", () => {
    const target = cparClaim("CPAR_UNDER_VERIFICATION", {
      cpar: {
        responsibleDeptId: PRODUCTION,
        cftMemberDeptIds: [ENGINEERING],
        userHeadVerifierId: "u-qa-lead",
      },
    });

    expect(can(prodStaff, "cpar.verify", target)).toBe(false);
    expect(can(qa, "cpar.verify", target)).toBe(false);
  });

  it("mewajibkan empat kapasitas verifier yang sama untuk semua tipe klaim (asumsi A-01)", () => {
    expect(REQUIRED_VERIFIER_ROLES).toEqual(["QA_HEAD", "USER_HEAD", "FACTORY_MGR", "PRESDIR"]);
  });
});

describe("Modul 4 — monitoring", () => {
  it("memberi penilaian efektivitas kepada QA dan manajemen, bukan departemen pelaksana", () => {
    const target = cparClaim("CAPA_MONITORING");

    expect(can(factoryMgr, "monitoring.setEffectiveness", target)).toBe(true);
    expect(can(presdir, "monitoring.setEffectiveness", target)).toBe(true);
    expect(can(qa, "monitoring.setEffectiveness", target)).toBe(true);
    expect(can(qaHead, "monitoring.setEffectiveness", target)).toBe(true);

    // Departemen yang mengerjakan perbaikan tetap tidak menilai hasilnya sendiri.
    expect(can(prodStaff, "monitoring.setEffectiveness", target)).toBe(false);
    expect(can(prodHead, "monitoring.setEffectiveness", target)).toBe(false);
  });

  it("tidak memberi Administrator kewenangan menilai (asumsi A-06)", () => {
    // Admin mengurus sistem, bukan memutuskan mutu — sama seperti verifikasi CPAR.
    expect(can(admin, "monitoring.setEffectiveness", cparClaim("CAPA_MONITORING"))).toBe(false);
  });

  it("membiarkan departemen penanggung jawab mengunggah evidence implementasi", () => {
    const target = cparClaim("CAPA_MONITORING");

    expect(can(prodStaff, "monitoring.evidence.upload", target)).toBe(true);
    expect(can(purchasingStaff, "monitoring.evidence.upload", target)).toBe(false);
  });

  it("menutup seluruh aksi tulis pada klaim yang sudah terminal", () => {
    for (const status of ["IGNORED", "VERIFIED_CLOSED"] as const) {
      const target = cparClaim(status);

      expect(can(qa, "claim.followUp", target), status).toBe(false);
      expect(can(qa, "cpar.submitFinal", target), status).toBe(false);
      expect(can(qa, "monitoring.submitReport", target), status).toBe(false);
      expect(can(factoryMgr, "monitoring.setEffectiveness", target), status).toBe(false);
    }
  });
});

describe("cakupan visibilitas (kriteria penerimaan #4)", () => {
  it("menolak USER_DEPT dari departemen lain atas klaim yang bukan tanggung jawabnya", () => {
    const target = cparClaim("CPAR_IN_PROGRESS");

    expect(canViewClaim(purchasingStaff, target)).toBe(false);
    expect(canViewClaim(prodStaff, target)).toBe(true);
    expect(() => assertCan(purchasingStaff, "cpar.view", target)).toThrow(ForbiddenError);
  });

  it("menyembunyikan klaim yang belum terbit dari departemen pengguna", () => {
    expect(canViewClaim(prodStaff, claim("DRAFT"))).toBe(false);
    expect(canViewClaim(prodStaff, claim("PENDING_QA_HEAD_REVIEW"))).toBe(false);
  });

  it("menampilkan klaim PUBLISHED dan IGNORED ke semua orang (asumsi A-07)", () => {
    expect(canViewClaim(purchasingStaff, claim("PUBLISHED"))).toBe(true);
    expect(canViewClaim(purchasingStaff, claim("IGNORED"))).toBe(true);
  });

  it("memberi QA, QA Head, Factory Manager, PresDir, dan Admin akses ke semua klaim", () => {
    const hidden = cparClaim("CPAR_IN_PROGRESS");

    for (const actor of [qa, qaHead, factoryMgr, presdir, admin]) {
      expect(canViewClaim(actor, hidden), actor.id).toBe(true);
    }
  });

  it("menyusun filter Prisma yang sejalan dengan canViewClaim", () => {
    expect(visibleClaimsWhere(qa)).toEqual({});
    expect(visibleClaimsWhere(admin)).toEqual({});

    expect(visibleClaimsWhere(prodStaff)).toEqual({
      OR: [
        { cpar: { responsibleDeptId: PRODUCTION } },
        { cpar: { cftMembers: { some: { departmentId: PRODUCTION } } } },
        { status: { in: ["PUBLISHED", "IGNORED"] } },
      ],
    });
  });

  it("membatasi pengguna departemen tanpa penempatan ke klaim broadcast saja", () => {
    const orphan: Actor = { id: "u-orphan", roles: ["USER_DEPT"], departmentId: null };

    expect(visibleClaimsWhere(orphan)).toEqual({ status: { in: ["PUBLISHED", "IGNORED"] } });
  });
});

describe("penjaga route (lapis pertama)", () => {
  it("mengunci master data untuk ADMIN saja", () => {
    expect(routeAllowed("/master", ["ADMIN"])).toBe(true);
    expect(routeAllowed("/master/departments", ["ADMIN"])).toBe(true);
    expect(routeAllowed("/master/departments", ["QA_HEAD"])).toBe(false);
  });

  it("membuka log notifikasi untuk QA Head dan ADMIN", () => {
    expect(routeAllowed("/notifications", ["QA_HEAD"])).toBe(true);
    expect(routeAllowed("/notifications", ["ADMIN"])).toBe(true);
    expect(routeAllowed("/notifications", ["USER_DEPT"])).toBe(false);
  });

  it("membiarkan route yang tidak dijaga lewat", () => {
    expect(routeAllowed("/dashboard", ["USER_DEPT"])).toBe(true);
    expect(routeAllowed("/claims/abc", ["USER_DEPT"])).toBe(true);
  });

  it("tidak tertipu prefix yang kebetulan mirip", () => {
    expect(routeAllowed("/master-data-export", ["QA"])).toBe(true);
  });
});

describe("pesan penolakan", () => {
  it("membedakan status yang sudah berpindah dari role yang memang tidak berwenang", () => {
    // Halaman review yang sudah basi: QA Head menekan Approve pada klaim yang
    // sementara itu sudah terbit.
    expect(() => assertCan(qaHead, "claim.review.approve", claim("PUBLISHED"))).toThrow(
      /berstatus PUBLISHED/,
    );

    expect(() => assertCan(qa, "claim.review.approve", claim("PENDING_QA_HEAD_REVIEW"))).toThrow(
      /tidak berhak/,
    );
  });

  it("menyarankan muat ulang hanya ketika itu memang menolong", () => {
    expect(() => assertCan(qaHead, "claim.review.approve", claim("PUBLISHED"))).toThrow(
      /muat ulang/i,
    );

    expect(() => assertCan(prodStaff, "claim.review.approve", claim("PENDING_QA_HEAD_REVIEW"))).toThrow(
      /tidak berhak/,
    );
  });
});

describe("claim.discard", () => {
  const draft = (createdById: string) => ({
    status: "DRAFT" as const,
    createdById,
    cpar: null,
  });

  const qaStaff = { id: "u-qa", roles: ["QA"] as const, departmentId: "d-qa" };

  it("mengizinkan pembuatnya membuang draftnya sendiri", () => {
    expect(can({ ...qaStaff, roles: ["QA"] }, "claim.discard", draft("u-qa"))).toBe(true);
  });

  it("menolak QA lain membuang draft yang bukan miliknya", () => {
    expect(can({ ...qaStaff, roles: ["QA"] }, "claim.discard", draft("u-lain"))).toBe(false);
  });

  /**
   * Inilah batas yang menjaga prinsip "satu klaim = satu record hidup". Begitu klaim
   * terbit ia punya Claim No. yang sudah dilihat dan dirujuk orang lain; membuangnya
   * bukan lagi membatalkan pekerjaan sendiri, melainkan menghapus catatan bersama.
   */
  it.each([
    "PENDING_QA_HEAD_REVIEW",
    "REVISION_REQUESTED",
    "PUBLISHED",
    "CPAR_IN_PROGRESS",
    "VERIFIED_CLOSED",
    "IGNORED",
  ] as const)("menolak pembuangan pada status %s", (status) => {
    expect(can({ ...qaStaff, roles: ["QA"] }, "claim.discard", { status, createdById: "u-qa", cpar: null })).toBe(
      false,
    );
  });

  it("memberi Administrator kewenangan atas draft siapa pun", () => {
    expect(
      can({ id: "u-adm", roles: ["ADMIN"], departmentId: null }, "claim.discard", draft("u-lain")),
    ).toBe(true);
  });

  it("tidak memberi kewenangan kepada departemen pelaksana maupun manajemen", () => {
    for (const role of ["USER_DEPT", "USER_HEAD", "QA_HEAD", "FACTORY_MGR", "PRESDIR"] as const) {
      expect(
        can({ id: "u-x", roles: [role], departmentId: "d-prd" }, "claim.discard", draft("u-x")),
      ).toBe(false);
    }
  });
});
