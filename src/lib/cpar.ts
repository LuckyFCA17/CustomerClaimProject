import type { CparSectionKey, ResponsibilityType, RoleCode } from "@/generated/prisma/enums";
import { REQUIRED_VERIFIER_ROLES } from "@/lib/permissions";

/**
 * Aturan isi CPAR (§6 Modul 3).
 *
 * Dipisahkan dari server action supaya dua pertanyaan yang menentukan seluruh modul —
 * "section mana yang masih kurang?" dan "siapa saja yang harus memverifikasi?" — dapat
 * diuji tanpa basis data, dan dijawab dengan cara yang sama oleh UI maupun server.
 */

export const SECTION_ORDER = [
  "PROBLEM_DESCRIPTION",
  "TEMPORARY_ACTION",
  "ROOT_CAUSE_OCCURRENCE",
  "ROOT_CAUSE_OUTFLOW",
  "PERMANENT_COUNTERMEASURE",
  "STANDARDIZATION_HORIZONTAL",
  "EFFECTIVENESS_PLAN",
] as const satisfies readonly CparSectionKey[];

export const SECTION_LABEL: Record<CparSectionKey, string> = {
  PROBLEM_DESCRIPTION: "Problem description",
  TEMPORARY_ACTION: "Temporary action",
  ROOT_CAUSE_OCCURRENCE: "Root cause — occurrence",
  ROOT_CAUSE_OUTFLOW: "Root cause — outflow",
  PERMANENT_COUNTERMEASURE: "Permanent countermeasure",
  STANDARDIZATION_HORIZONTAL: "Standardization & horizontal deployment",
  EFFECTIVENESS_PLAN: "Effectiveness plan",
};

/** Penjelasan singkat di bawah judul section — apa yang sebenarnya diminta di sini. */
export const SECTION_HINT: Record<CparSectionKey, string> = {
  PROBLEM_DESCRIPTION:
    "Apa yang terjadi menurut pelanggan, beserta angkanya: jumlah, lot, dan tanggal.",
  TEMPORARY_ACTION:
    "Tindakan penahan yang sudah dijalankan — sortir, hold, penggantian — berikut waktunya.",
  ROOT_CAUSE_OCCURRENCE: "Mengapa cacat itu terbentuk. Telusuri sampai sebab yang bisa dikendalikan.",
  ROOT_CAUSE_OUTFLOW: "Mengapa cacat itu lolos sampai ke pelanggan.",
  PERMANENT_COUNTERMEASURE:
    "Perbaikan tetap untuk kedua akar masalah, beserta penanggung jawab dan tenggatnya.",
  STANDARDIZATION_HORIZONTAL:
    "Dokumen yang diperbarui dan part atau line lain yang menerima perbaikan serupa.",
  EFFECTIVENESS_PLAN: "Cara efektivitas akan diukur, dan pada periode apa.",
};

export const SECTION_INDEX: Record<CparSectionKey, number> = Object.fromEntries(
  SECTION_ORDER.map((key, index) => [key, index + 1]),
) as Record<CparSectionKey, number>;

/**
 * Section yang isinya diturunkan dari klaim, bukan diketik.
 *
 * Problem description sudah dimasukkan QA pada Issue Customer Claim Information, dan
 * klaim tidak dapat diubah lagi setelah terbit. Memintanya diketik ulang di sini hanya
 * menghasilkan salinan kedua yang bisa berbeda dari aslinya — dan menahan submit final
 * karena salinan itu kosong adalah penolakan atas pekerjaan yang sebenarnya sudah
 * selesai. Section seperti ini tidak pernah terhitung kurang.
 */
export const DERIVED_SECTIONS = ["PROBLEM_DESCRIPTION"] as const satisfies readonly CparSectionKey[];

export function isDerivedSection(key: CparSectionKey): boolean {
  return (DERIVED_SECTIONS as readonly CparSectionKey[]).includes(key);
}

export function sectionLabel(key: CparSectionKey): string {
  return SECTION_LABEL[key];
}

// ─────────────────────── Kelengkapan pengisian ───────────────────────

export interface SectionState {
  readonly key: CparSectionKey;
  readonly content: string | null;
  readonly isRequired: boolean;
}

export function isSectionFilled(section: Pick<SectionState, "content">): boolean {
  return (section.content ?? "").trim().length > 0;
}

/**
 * Section wajib yang masih kosong, dalam urutan form.
 *
 * Hasilnya dipakai dua kali: menolak submit final, dan mengisi pop-up yang menyebutkan
 * satu per satu apa yang kurang (kriteria penerimaan #7). Section yang tidak terdaftar
 * di `SECTION_ORDER` tetap dihitung di urutan terakhir, supaya penambahan section baru
 * di skema tidak diam-diam lolos dari pemeriksaan.
 */
export function missingRequiredSections(
  sections: readonly SectionState[],
): readonly CparSectionKey[] {
  const order = (key: CparSectionKey) => {
    const index = (SECTION_ORDER as readonly CparSectionKey[]).indexOf(key);
    return index === -1 ? SECTION_ORDER.length : index;
  };

  return sections
    .filter(
      (section) =>
        section.isRequired && !isDerivedSection(section.key) && !isSectionFilled(section),
    )
    .map((section) => section.key)
    .sort((a, b) => order(a) - order(b));
}

export function missingSectionLabels(sections: readonly SectionState[]): readonly string[] {
  return missingRequiredSections(sections).map(sectionLabel);
}

// ─────────────────────── Rantai verifikasi ───────────────────────

export const VERIFIER_CAPACITY_LABEL: Record<string, string> = {
  QA_HEAD: "QA Dept. Head",
  USER_HEAD: "User Dept. Head",
  FACTORY_MGR: "Factory Manager",
  PRESDIR: "President Director",
};

export interface CparForVerification {
  readonly responsibilityType: ResponsibilityType;
  readonly responsibleDeptId: string;
}

/**
 * Kapasitas yang wajib memutuskan sebelum CPAR dapat disetujui (§5, PLAN §2.4).
 *
 * Tidak bergantung pada tipe penanggung jawab, dan itu disengaja: pada tipe CFT,
 * `responsibleDeptId` berperan sebagai lead dept dan hanya head lead dept yang wajib
 * (asumsi A-04) — head dept CFT lain tetap boleh mengisi dan melihat, tapi approval
 * tidak menunggu mereka. Yang menyaring head dept mana adalah `verifierCapacity`,
 * bukan daftar ini. Daftarnya dibekukan ke payload notifikasi saat siklus dibuka,
 * sehingga perubahan master data di tengah siklus tidak menggeser syarat approval.
 */
export function requiredVerifiers(): readonly RoleCode[] {
  return REQUIRED_VERIFIER_ROLES;
}

export interface VerificationRecord {
  readonly role: RoleCode;
  readonly decision: "VERIFIED" | "REVISE";
  readonly cycle: number;
}

export interface VerificationProgress {
  /** Kapasitas yang sudah memutuskan VERIFIED pada siklus berjalan. */
  readonly verified: readonly RoleCode[];
  /** Kapasitas wajib yang belum memutuskan apa pun pada siklus berjalan. */
  readonly pending: readonly RoleCode[];
  readonly isComplete: boolean;
}

/**
 * Keadaan rantai verifikasi pada satu siklus.
 *
 * Keputusan siklus sebelumnya sengaja tidak ikut dihitung: satu REVISE menaikkan siklus,
 * dan CPAR yang sudah diperbaiki harus diperiksa ulang oleh semua kapasitas, bukan hanya
 * oleh yang dulu menolaknya.
 */
export function verificationProgress(
  verifications: readonly VerificationRecord[],
  cycle: number,
): VerificationProgress {
  const required = requiredVerifiers();
  const thisCycle = verifications.filter((entry) => entry.cycle === cycle);

  const verified = required.filter((role) =>
    thisCycle.some((entry) => entry.role === role && entry.decision === "VERIFIED"),
  );
  const pending = required.filter((role) => !thisCycle.some((entry) => entry.role === role));

  return { verified, pending, isComplete: verified.length === required.length };
}

/**
 * Kapasitas yang dipakai seorang aktor saat memverifikasi.
 *
 * Seorang pengguna bisa memegang lebih dari satu role — QA Dept. Head yang juga QA Staff,
 * misalnya. Yang dicatat di `Verification` adalah kapasitasnya, bukan seluruh rolenya,
 * karena kunci unik `(cparId, role, cycle)` berarti "satu keputusan per kapasitas".
 * Urutan `REQUIRED_VERIFIER_ROLES` menentukan kapasitas mana yang dipakai bila seseorang
 * memenuhi lebih dari satu.
 */
export function verifierCapacity(
  actorRoles: readonly RoleCode[],
  actorDepartmentId: string | null,
  cpar: CparForVerification,
): RoleCode | null {
  for (const role of requiredVerifiers()) {
    if (!actorRoles.includes(role)) continue;

    // USER_HEAD hanya berlaku untuk head dept yang ditunjuk; head dept lain yang
    // kebetulan membuka halaman ini tidak mengisi kapasitas itu.
    if (role === "USER_HEAD" && actorDepartmentId !== cpar.responsibleDeptId) continue;

    return role;
  }

  return null;
}
