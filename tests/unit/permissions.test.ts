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

  it("mewajibkan empat kapasitas verifier yang sama untuk semua tipe klaim (asumsi A-01)", () => {
    expect(REQUIRED_VERIFIER_ROLES).toEqual(["QA_HEAD", "USER_HEAD", "FACTORY_MGR", "PRESDIR"]);
  });
});

describe("Modul 4 — monitoring", () => {
  it("memberi penilaian efektivitas hanya kepada Factory Manager dan PresDir", () => {
    const target = cparClaim("CAPA_MONITORING");

    expect(can(factoryMgr, "monitoring.setEffectiveness", target)).toBe(true);
    expect(can(presdir, "monitoring.setEffectiveness", target)).toBe(true);
    expect(can(qa, "monitoring.setEffectiveness", target)).toBe(false);
    expect(can(prodStaff, "monitoring.setEffectiveness", target)).toBe(false);
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
