import type { CparSectionKey, ResponsibilityType, RoleCode } from "@/generated/prisma/enums";
import { REQUIRED_VERIFIER_ROLES } from "@/lib/permissions";
import { hasActionPlan } from "@/schemas/action-plan";
import { hasProcessFlow } from "@/schemas/process-flow";
import { hasRootCause } from "@/schemas/root-cause";
import { hasTemporaryAction } from "@/schemas/temporary-action";

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
  "PROCESS_FLOW",
  "ROOT_CAUSE_OCCURRENCE",
  "ROOT_CAUSE_OUTFLOW",
  "PERMANENT_COUNTERMEASURE",
  "STANDARDIZATION_HORIZONTAL",
  "EFFECTIVENESS_PLAN",
] as const satisfies readonly CparSectionKey[];

export const SECTION_LABEL: Record<CparSectionKey, string> = {
  PROBLEM_DESCRIPTION: "Problem description",
  TEMPORARY_ACTION: "Temporary action",
  PROCESS_FLOW: "Process flow diagram",
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
  PROCESS_FLOW:
    "Urutan proses dari material sampai pengiriman, dengan tanda pada proses yang dicurigai membentuk cacat (occurrence) dan yang meloloskannya (outflow).",
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
 * Problem description sudah dimasukkan QA pada Issue Customer Claim Information.
 * Memintanya diketik ulang di sini hanya menghasilkan salinan kedua yang bisa berbeda
 * dari aslinya — dan menahan submit final karena salinan itu kosong adalah penolakan
 * atas pekerjaan yang sebenarnya sudah selesai. Section seperti ini tidak pernah
 * terhitung kurang, dan ikut berubah sendiri bila klaimnya disunting.
 */
export const DERIVED_SECTIONS = ["PROBLEM_DESCRIPTION"] as const satisfies readonly CparSectionKey[];

export function isDerivedSection(key: CparSectionKey): boolean {
  return (DERIVED_SECTIONS as readonly CparSectionKey[]).includes(key);
}

export function sectionLabel(key: CparSectionKey): string {
  return SECTION_LABEL[key];
}

// ─────────────────────── Kelengkapan pengisian ───────────────────────

/**
 * Section yang isinya tabel, bukan paragraf.
 *
 * Temporary action hampir selalu beberapa kegiatan sekaligus, masing-masing dengan
 * angkanya sendiri. Angka yang terkubur di dalam paragraf tidak dapat dijumlahkan
 * maupun diperiksa, jadi section ini terisi lewat `CparSection.data`.
 */
export const STRUCTURED_SECTIONS = [
  "TEMPORARY_ACTION",
  "PROCESS_FLOW",
  "ROOT_CAUSE_OCCURRENCE",
  "ROOT_CAUSE_OUTFLOW",
  "PERMANENT_COUNTERMEASURE",
  "STANDARDIZATION_HORIZONTAL",
] as const satisfies readonly CparSectionKey[];

export function isStructuredSection(key: CparSectionKey): boolean {
  return (STRUCTURED_SECTIONS as readonly CparSectionKey[]).includes(key);
}

/**
 * `Attachment.entityType` untuk evidence yang menempel pada satu baris tindakan.
 *
 * Dibedakan dari evidence CPAR ("Cpar") yang berlaku untuk seluruh lembar: yang satu
 * menjawab "bukti bahwa tindakan ini dikerjakan", yang lain "berkas pendukung CPAR ini".
 * Menyatukan keduanya akan membuat daftar evidence umum dipenuhi berkas per tindakan.
 *
 * Satu nilai untuk kedua section yang memakainya: penanda barisnya UUID, jadi tidak ada
 * yang bertabrakan, dan memecahnya per section hanya akan menambah cabang pada setiap
 * pemanggilan tanpa membedakan apa pun.
 */
export const ACTION_ITEM_ENTITY = "CparActionItem";

/**
 * `Attachment.entityType` untuk dokumen yang dilampirkan atas Initial Document Request.
 *
 * `entityId` memakai id dokumen yang diminta, bukan id baris permintaannya: barisnya
 * berkunci gabungan (cparId, initialDocumentId) dan tidak punya id tunggal. Pemanggilan
 * berkasnya selalu disaring dengan claimId juga, sehingga satu id dokumen yang sama
 * pada klaim lain tidak ikut terbawa.
 */
export const INITIAL_DOCUMENT_ENTITY = "CparInitialDocument";

/**
 * Section yang isinya daftar tindakan bertanggung jawab (PIC, tanggal, evidence).
 *
 * Permanent countermeasure memperbaiki akar masalahnya; standardization & horizontal
 * deployment menyebarkan perbaikan itu ke dokumen, part, dan line lain. Keduanya sama
 * bentuknya: daftar pekerjaan yang ditugaskan kepada orang dengan tenggat dan buktinya.
 */
export const ACTION_PLAN_SECTIONS = [
  "PERMANENT_COUNTERMEASURE",
  "STANDARDIZATION_HORIZONTAL",
] as const satisfies readonly CparSectionKey[];

export type ActionPlanSectionKey = (typeof ACTION_PLAN_SECTIONS)[number];

export function isActionPlanSection(key: CparSectionKey): key is ActionPlanSectionKey {
  return (ACTION_PLAN_SECTIONS as readonly CparSectionKey[]).includes(key);
}

/**
 * Kata-kata yang berbeda antara kedua section.
 *
 * Bentuk isiannya sama, tetapi yang ditulis orang tidak: "tindakan perbaikan" pada
 * section 6, "dokumen atau penerapan" pada section 7. Label yang seragam akan membuat
 * section 7 terbaca seperti salinan section 6, dan isinya pun akan ikut menjadi salinan.
 */
export interface ActionPlanCopy {
  readonly itemLabel: string;
  readonly itemPlaceholder: string;
  readonly addLabel: string;
  readonly startLabel: string;
  readonly notePlaceholder: string;
  readonly savedTitle: string;
  readonly emptyHint: string;
}

export const ACTION_PLAN_COPY: Record<ActionPlanSectionKey, ActionPlanCopy> = {
  PERMANENT_COUNTERMEASURE: {
    itemLabel: "Tindakan perbaikan",
    itemPlaceholder:
      "Mis. mengganti seal regulator mesin 4 dan memasukkannya ke jadwal perawatan jam operasi",
    addLabel: "Tambah tindakan",
    startLabel: "Isi perbaikan tetap",
    notePlaceholder:
      "Keterangan yang berlaku untuk seluruh perbaikan, misalnya urutan pelaksanaannya.",
    savedTitle: "Perbaikan tetap tersimpan",
    emptyHint: "Belum ada tindakan. Tambahkan baris di bawah.",
  },
  STANDARDIZATION_HORIZONTAL: {
    itemLabel: "Dokumen atau penerapan",
    itemPlaceholder:
      "Mis. WI-PRD-014 direvisi ke rev. 3, atau jadwal perawatan jam operasi diterapkan ke mesin 1–3",
    addLabel: "Tambah baris",
    startLabel: "Isi standardisasi & penyebaran",
    notePlaceholder:
      "Keterangan yang berlaku untuk seluruh penyebaran, misalnya part atau line yang sengaja dikecualikan.",
    savedTitle: "Standardisasi & penyebaran tersimpan",
    emptyHint:
      "Belum ada baris. Catat dokumen yang diperbarui dan part atau line lain yang menerima perbaikan serupa.",
  },
};

export interface SectionState {
  readonly key: CparSectionKey;
  readonly content: string | null;
  readonly isRequired: boolean;
  /** Isi terstruktur; section tabel terisi lewat sini, bukan lewat `content`. */
  readonly data?: unknown;
}

/** Sebuah section terisi bila ada paragrafnya, atau ada barisnya pada section tabel. */
export function isSectionFilled(section: Pick<SectionState, "key" | "content" | "data">): boolean {
  if (section.key === "TEMPORARY_ACTION") return hasTemporaryAction(section.data);
  if (section.key === "PROCESS_FLOW") return hasProcessFlow(section.data);
  if (section.key === "ROOT_CAUSE_OCCURRENCE" || section.key === "ROOT_CAUSE_OUTFLOW") {
    return hasRootCause(section.data);
  }
  if (isActionPlanSection(section.key)) return hasActionPlan(section.data);

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
  /** Orang yang ditunjuk mengisi kapasitas User Dept. Head pada CPAR ini. */
  readonly userHeadVerifierId?: string | null;
}

/**
 * Kapasitas yang wajib memutuskan sebelum CPAR dapat disetujui (§5, PLAN §2.4).
 *
 * Tidak bergantung pada tipe penanggung jawab, dan itu disengaja: pada tipe CFT,
 * `responsibleDeptId` berperan sebagai Main Responsible Department, dan hanya satu orang
 * yang ditunjuk dari sana yang wajib
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
 * Kapasitas verifier yang dipegang seorang aktor pada satu CPAR.
 *
 * Mengembalikan daftar, bukan satu, karena satu orang memang dapat memegang dua
 * kapasitas sekaligus. Yang paling sering: CPAR yang main responsible department-nya QA
 * — QA Dept. Head di sana juga menjadi perwakilan departemen pelaksana. Selama fungsi ini
 * hanya mengembalikan satu kapasitas, keputusan keduanya tidak pernah bisa dicatat dan
 * rantai verifikasi tertahan selamanya.
 *
 * Kapasitas User Dept. Head mengikuti **penunjukan**, bukan role. Penunjukan itu ada
 * justru karena role tidak selalu cukup: departemen QA tidak punya pemegang USER_HEAD.
 * CPAR lama yang belum punya penunjukan jatuh kembali ke aturan sebelumnya — pemegang
 * USER_HEAD di departemen penanggung jawab — supaya tidak ada CPAR berjalan yang
 * mendadak kehilangan verifiernya saat kolom ini ditambahkan.
 */
export function verifierCapacities(
  actor: { readonly id: string; readonly roles: readonly RoleCode[]; readonly departmentId: string | null },
  cpar: CparForVerification,
): readonly RoleCode[] {
  const held: RoleCode[] = [];

  for (const role of requiredVerifiers()) {
    if (role === "USER_HEAD") {
      const designated = cpar.userHeadVerifierId;

      if (designated) {
        if (designated === actor.id) held.push(role);
        continue;
      }

      // Tanpa penunjukan: aturan lama.
      if (actor.roles.includes(role) && actor.departmentId === cpar.responsibleDeptId) {
        held.push(role);
      }

      continue;
    }

    if (actor.roles.includes(role)) held.push(role);
  }

  return held;
}

/**
 * Kapasitas pertama yang dipegang aktor, menurut urutan verifier wajib.
 *
 * Dipertahankan untuk pemanggil yang memang hanya perlu tahu "apakah orang ini verifier".
 * Yang memerlukan seluruh kapasitasnya — halaman CPAR dan server action verifikasi —
 * memakai `verifierCapacities`.
 */
export function verifierCapacity(
  actorRoles: readonly RoleCode[],
  actorDepartmentId: string | null,
  cpar: CparForVerification,
  actorId = "",
): RoleCode | null {
  const held = verifierCapacities(
    { id: actorId, roles: actorRoles, departmentId: actorDepartmentId },
    cpar,
  );

  return held[0] ?? null;
}
