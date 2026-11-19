import type { ClaimStatus, CparSectionKey, Prisma, RoleCode } from "@/generated/prisma/client";
import { ForbiddenError } from "@/lib/errors";

/**
 * Sumber kebenaran tunggal RBAC (§3, PLAN §2).
 *
 * Dipakai oleh tiga lapis penegakan:
 *   1. middleware.ts        — penjaga route kasar per prefix
 *   2. server action        — assertCan(actor, action, claim) sebelum assertTransition
 *   3. komponen UI          — menyembunyikan tombol yang tidak relevan
 *
 * Lapisan 3 bukan pengaman. Menyembunyikan tombol tidak menghentikan siapa pun yang
 * memanggil server action langsung; lapisan 2 yang menolaknya.
 */

// ─────────────────────────── Tipe konteks ───────────────────────────

export interface Actor {
  readonly id: string;
  readonly roles: readonly RoleCode[];
  readonly departmentId: string | null;
}

export interface ClaimContext {
  readonly status: ClaimStatus;
  readonly createdById: string;
  /**
   * Seluruh CPAR klaim ini — satu klaim dapat menerbitkan lebih dari satu.
   *
   * Daftar, bukan satu nilai: cakupan DEPT berlaku bila **salah satu** CPAR menyentuh
   * departemen pelakunya. Departemen yang menanggung CPAR kedua berhak atas klaimnya
   * sama penuhnya dengan yang menanggung CPAR pertama.
   */
  readonly cpars: readonly {
    readonly id?: string;
    readonly responsibleDeptId: string;
    readonly cftMemberDeptIds: readonly string[];
    /** Orang yang ditunjuk mengisi kapasitas User Dept. Head; null bila belum ditunjuk. */
    readonly userHeadVerifierId?: string | null;
  }[];
}

/**
 * Bentuk `select` Prisma yang memuat tepat apa yang dibutuhkan `ClaimContext`.
 *
 * Dikumpulkan di sini supaya kedelapan pemanggil `canViewClaim`/`can` tidak menuliskan
 * daftar kolomnya masing-masing. Dulu memang begitu, dan ketika CPAR berubah dari satu
 * menjadi banyak, tiap salinan harus ditemukan satu per satu — persis jenis perubahan
 * yang paling mudah terlewat di satu tempat tanpa ada yang gagal kompilasi.
 */
export const CLAIM_CONTEXT_SELECT = {
  status: true,
  createdById: true,
  cpars: {
    select: {
      id: true,
      responsibleDeptId: true,
      userHeadVerifierId: true,
      cftMembers: { select: { departmentId: true } },
    },
  },
} as const;

/** Baris klaim hasil `CLAIM_CONTEXT_SELECT` → `ClaimContext`. */
export function toClaimContext(claim: {
  status: ClaimStatus;
  createdById: string;
  cpars: readonly {
    id: string;
    responsibleDeptId: string;
    userHeadVerifierId?: string | null;
    cftMembers: readonly { departmentId: string }[];
  }[];
}): ClaimContext {
  return {
    status: claim.status,
    createdById: claim.createdById,
    cpars: claim.cpars.map((cpar) => ({
      id: cpar.id,
      responsibleDeptId: cpar.responsibleDeptId,
      userHeadVerifierId: cpar.userHeadVerifierId ?? null,
      cftMemberDeptIds: cpar.cftMembers.map((member) => member.departmentId),
    })),
  };
}

/**
 * Cakupan hak sebuah role atas satu aksi:
 *   ALL   — berlaku untuk semua klaim
 *   OWNER — hanya klaim yang ia buat sendiri
 *   DEPT  — hanya klaim yang departemennya ditunjuk responsible atau anggota CFT
 */
export type Scope = "ALL" | "OWNER" | "DEPT";

// ─────────────────────────── Daftar aksi ───────────────────────────

export const ACTIONS = [
  "claim.view",
  "claim.create",
  "claim.update",
  "claim.amend",
  "claim.discard",
  "claim.submit",
  "claim.review.approve",
  "claim.review.revise",
  "claim.followUp",
  "claim.ignore",
  "claim.export",
  "claim.package",
  "cpar.view",
  "cpar.section.fill",
  "cpar.evidence.upload",
  "cpar.submitFinal",
  "cpar.verify",
  "cpar.print",
  "monitoring.start",
  "monitoring.evidence.upload",
  "monitoring.setEffectiveness",
  "monitoring.submitReport",
  "monitoring.print",
  "audit.view",
  "notification.viewLog",
  "master.manage",
  "user.manage",
] as const;

export type Action = (typeof ACTIONS)[number];

interface ActionRule {
  /** Role yang berhak, beserta cakupannya. Role yang tidak terdaftar selalu ditolak. */
  readonly roles: Partial<Record<RoleCode, Scope>>;
  /**
   * Status klaim yang mengizinkan aksi ini.
   * `"ANY"` = status apa pun. `null` = aksi tidak terikat klaim (mis. master data).
   */
  readonly statuses: readonly ClaimStatus[] | "ANY" | null;
}

const CPAR_PHASE_STATUSES = [
  "CPAR_ISSUED",
  "CPAR_IN_PROGRESS",
  "CPAR_UNDER_VERIFICATION",
  "CPAR_REVISION",
  "CPAR_APPROVED",
  "CAPA_MONITORING",
  "VERIFIED_CLOSED",
] as const satisfies readonly ClaimStatus[];

const CPAR_FILLING_STATUSES = [
  "CPAR_ISSUED",
  "CPAR_IN_PROGRESS",
  "CPAR_REVISION",
] as const satisfies readonly ClaimStatus[];

/** Sejak CPAR bisa dicetak — sebelum approved PDF diberi watermark "DRAFT" (§6 Modul 3). */
const CPAR_PRINTABLE_STATUSES = [
  "CPAR_IN_PROGRESS",
  "CPAR_UNDER_VERIFICATION",
  "CPAR_REVISION",
  "CPAR_APPROVED",
  "CAPA_MONITORING",
  "VERIFIED_CLOSED",
] as const satisfies readonly ClaimStatus[];

const READ_ONLY_FOR_EVERYONE: Partial<Record<RoleCode, Scope>> = {
  QA: "ALL",
  QA_HEAD: "ALL",
  USER_DEPT: "DEPT",
  USER_HEAD: "DEPT",
  FACTORY_MGR: "ALL",
  PRESDIR: "ALL",
  ADMIN: "ALL",
};

/**
 * Matriks ACTION × ROLE × STATUS.
 *
 * Catatan yang disengaja (asumsi A-06, dikonfirmasi):
 * ADMIN tidak boleh approve klaim maupun memverifikasi CPAR. Admin mengurus sistem,
 * bukan memutuskan mutu — kalau tidak, blok tanda tangan di PDF kehilangan maknanya.
 */
export const PERMISSION_MATRIX: Record<Action, ActionRule> = {
  "claim.view": { roles: READ_ONLY_FOR_EVERYONE, statuses: "ANY" },

  "claim.create": {
    roles: { QA: "ALL", QA_HEAD: "ALL", ADMIN: "ALL" },
    statuses: null,
  },
  /**
   * QA bekerja sebagai satu regu, bukan sebagai pemilik berkas masing-masing.
   *
   * `claim.update`, `claim.amend`, dan `claim.submit` berlaku `ALL` bagi QA: siapa pun
   * di QA dapat menyunting dan mengirim klaim yang dicatat rekannya. Yang menuntut ini
   * keadaan sehari-hari — klaim masuk saat pencatatnya libur, bertukar shift, atau
   * sedang di lapangan — dan sebelumnya klaim itu terhenti sampai orangnya kembali.
   *
   * Yang menjaga pertanggungjawabannya bukan kepemilikan, melainkan jejaknya: tiap
   * penyuntingan klaim yang sudah terbit menulis audit log beserta nama pelakunya, dan
   * pencatat aslinya tetap tercantum sebagai pembuat di lembar cetaknya.
   *
   * `claim.discard` sengaja **tidak** ikut: membuang draft orang lain bukan menyunting,
   * dan draft yang belum dikirim tidak menghalangi siapa pun sehingga tidak ada yang
   * mendesak untuk dibuang orang lain.
   */
  "claim.update": {
    roles: { QA: "ALL", ADMIN: "ALL" },
    statuses: ["DRAFT", "REVISION_REQUESTED"],
  },
  /**
   * Menyunting Claim Information setelah klaim terbit.
   *
   * Dipisahkan dari `claim.update`, bukan sekadar menambah status ke sana, karena
   * keduanya peristiwa yang berbeda. `claim.update` menyimpan draft yang belum menjadi
   * apa pun bagi siapa pun dan sengaja tidak menulis audit log (asumsi A-17). Menyunting
   * klaim yang sudah terbit mengubah dokumen yang sudah dibaca, dirujuk, dan mungkin
   * sedang dikerjakan departemen lain — setiap perubahannya dicatat.
   *
   * Terbuka sampai klaim ditutup, termasuk sesudah CPAR disetujui dan sesudah pemantauan
   * berjalan. Yang menuntut ini kenyataan di lapangan: koreksi atas Claim Information —
   * nomor lot yang salah ketik, jumlah NG yang direvisi pelanggan, tanggal kejadian yang
   * baru terkonfirmasi — sering datang justru setelah CPAR disetujui, dan sebelumnya
   * satu-satunya jalan memperbaikinya adalah memutar ulang seluruh rantai verifikasi
   * lewat REVISE. Memaksa empat orang menandatangani ulang demi satu nomor lot membuat
   * orang memilih membiarkan datanya salah, dan itu hasil yang lebih buruk.
   *
   * Yang dulu dijaga oleh larangan ini — bahwa tanda tangan tidak menjaminkan isi yang
   * tidak pernah dibaca penandatangannya — sekarang dijaga oleh jejaknya, bukan oleh
   * penolakan:
   *
   *   · tiap penyuntingan menulis audit log beserta **nilai lamanya**, sehingga "sebelum
   *     ditandatangani tertulis apa" selalu dapat dijawab;
   *   · dokumennya dicetak ulang dengan nomor versi naik dan versi lama tetap tersimpan,
   *     sehingga lembar yang ditandatangani tetap ada sebagai dirinya sendiri.
   *
   * `CPAR_UNDER_VERIFICATION` tetap **tidak** termasuk, dan itu bukan sisa aturan lama.
   * Pada status itu empat verifier sedang memutuskan secara bersamaan atas isi yang
   * terpampang; mengubahnya di tengah jalan membuat sebagian memutuskan atas dokumen yang
   * berbeda dari sebagian lainnya, tanpa seorang pun tahu — dan tidak ada versi dokumen
   * maupun audit log yang dapat memperbaiki keputusan yang sudah telanjur diambil atas
   * teks yang keliru. Jendelanya pendek, dan jalurnya REVISE.
   */
  "claim.amend": {
    roles: { QA: "ALL", QA_HEAD: "ALL", ADMIN: "ALL" },
    statuses: [
      "PUBLISHED",
      "CPAR_ISSUED",
      "CPAR_IN_PROGRESS",
      "CPAR_REVISION",
      "CPAR_APPROVED",
      "CAPA_MONITORING",
      "VERIFIED_CLOSED",
    ],
  },
  /**
   * Membuang draft yang belum pernah dikirim.
   *
   * Hanya `DRAFT`, sengaja tidak termasuk `REVISION_REQUESTED`. Klaim yang pernah
   * dikembalikan untuk revisi sudah memiliki Claim No. dan pernah terbit — membuangnya
   * berarti menghapus catatan yang sudah dilihat dan dirujuk orang lain. Draft yang
   * belum bernomor belum menjadi apa pun bagi siapa pun.
   *
   * Pembuangannya tetap soft delete: barisnya ditandai, bukan dihapus (§Prinsip —
   * "jangan pernah hard delete klaim"). Audit log-nya pun tetap ditulis.
   */
  "claim.discard": {
    roles: { QA: "OWNER", ADMIN: "ALL" },
    statuses: ["DRAFT"],
  },
  "claim.submit": {
    roles: { QA: "ALL", ADMIN: "ALL" },
    statuses: ["DRAFT", "REVISION_REQUESTED"],
  },
  "claim.review.approve": {
    roles: { QA_HEAD: "ALL" },
    statuses: ["PENDING_QA_HEAD_REVIEW"],
  },
  "claim.review.revise": {
    roles: { QA_HEAD: "ALL" },
    statuses: ["PENDING_QA_HEAD_REVIEW"],
  },
  /**
   * Menerbitkan CPAR — yang pertama, maupun yang berikutnya.
   *
   * Statusnya mencakup seluruh rantai CPAR, bukan hanya `PUBLISHED`, karena kebutuhan
   * menerbitkan CPAR kedua justru muncul **setelah** yang pertama berjalan: analisis
   * CPAR Produksi menunjukkan part-nya juga lolos inspeksi di Warehouse, dan akar kedua
   * itu menuntut CPAR-nya sendiri ke departemen yang berbeda. Memaksanya masuk CPAR
   * pertama berarti satu departemen menandatangani analisis departemen lain.
   *
   * `VERIFIED_CLOSED` ikut terbuka: temuan berulang pada part yang sama kadang baru
   * terlihat setelah klaimnya ditutup, dan menerbitkan CPAR baru di sana lebih jujur
   * daripada membuka kembali klaim yang pemantauannya sudah dinyatakan efektif —
   * klaimnya otomatis kembali berjalan karena statusnya turunan dari CPAR-nya.
   *
   * `IGNORED` tidak termasuk: klaim yang diputuskan tidak ditindaklanjuti tidak memiliki
   * CPAR sama sekali, dan menerbitkan satu di sana berarti membatalkan keputusan itu
   * diam-diam alih-alih mencabutnya terang-terangan.
   */
  "claim.followUp": {
    roles: { QA: "ALL", QA_HEAD: "ALL" },
    statuses: [
      "PUBLISHED",
      "CPAR_ISSUED",
      "CPAR_IN_PROGRESS",
      "CPAR_UNDER_VERIFICATION",
      "CPAR_REVISION",
      "CPAR_APPROVED",
      "CAPA_MONITORING",
      "VERIFIED_CLOSED",
    ],
  },
  "claim.ignore": {
    roles: { QA: "ALL", QA_HEAD: "ALL" },
    statuses: ["PUBLISHED"],
  },
  /**
   * Ekspor berlaku untuk daftar, bukan satu klaim, jadi tidak terikat status.
   *
   * Yang membatasi isinya `visibleClaimsWhere` — ekspor tidak pernah memuat klaim yang
   * tidak boleh dilihat orangnya, berapa pun lebar penyaring yang ia kirimkan.
   */
  "claim.export": { roles: READ_ONLY_FOR_EVERYONE, statuses: null },
  /**
   * Mengunduh paket klaim — seluruh lembar cetak dan evidence dalam satu arsip.
   *
   * Tidak lebih longgar daripada membuka berkasnya satu per satu: siapa pun yang boleh
   * melihat klaimnya sudah dapat mengunduh tiap lampirannya dari layar. Yang berubah
   * hanya jumlah klik, dan aturan keterlihatan klaim tetap dipasang lebih dulu.
   *
   * DRAFT dan tahap review tidak termasuk: belum ada satu pun lembar yang dibuat, dan
   * paketnya hanya akan berisi foto part tanpa dokumen apa pun.
   */
  "claim.package": {
    roles: READ_ONLY_FOR_EVERYONE,
    statuses: [
      "PUBLISHED",
      "IGNORED",
      "CPAR_ISSUED",
      "CPAR_IN_PROGRESS",
      "CPAR_UNDER_VERIFICATION",
      "CPAR_REVISION",
      "CPAR_APPROVED",
      "CAPA_MONITORING",
      "VERIFIED_CLOSED",
    ],
  },

  "cpar.view": { roles: READ_ONLY_FOR_EVERYONE, statuses: CPAR_PHASE_STATUSES },
  "cpar.section.fill": {
    roles: { QA: "ALL", USER_DEPT: "DEPT", USER_HEAD: "DEPT" },
    statuses: CPAR_FILLING_STATUSES,
  },
  "cpar.evidence.upload": {
    roles: {
      QA: "ALL",
      QA_HEAD: "ALL",
      USER_DEPT: "DEPT",
      USER_HEAD: "DEPT",
      FACTORY_MGR: "ALL",
      PRESDIR: "ALL",
      ADMIN: "ALL",
    },
    statuses: CPAR_FILLING_STATUSES,
  },
  "cpar.submitFinal": {
    roles: { QA: "ALL", QA_HEAD: "ALL", ADMIN: "ALL" },
    statuses: ["CPAR_IN_PROGRESS", "CPAR_REVISION"],
  },
  "cpar.verify": {
    roles: { QA_HEAD: "ALL", USER_HEAD: "DEPT", FACTORY_MGR: "ALL", PRESDIR: "ALL" },
    statuses: ["CPAR_UNDER_VERIFICATION"],
  },
  "cpar.print": { roles: READ_ONLY_FOR_EVERYONE, statuses: CPAR_PRINTABLE_STATUSES },

  "monitoring.start": {
    roles: { QA: "ALL", QA_HEAD: "ALL", ADMIN: "ALL" },
    statuses: ["CPAR_APPROVED"],
  },
  "monitoring.evidence.upload": {
    roles: { QA: "ALL", USER_DEPT: "DEPT", USER_HEAD: "DEPT", ADMIN: "ALL" },
    statuses: ["CAPA_MONITORING"],
  },
  /**
   * Penilaian efektivitas CAPA.
   *
   * QA ikut menilai karena merekalah yang memegang data keluhan dan hasil inspeksi
   * sesudah perbaikan — angka yang menentukan apakah sebuah periode benar-benar
   * efektif. Factory Manager dan President Director tetap berwenang.
   *
   * Catatan: QA juga boleh mengunggah evidence pemantauan, sehingga seorang QA dapat
   * mengumpulkan bukti lalu menilainya sendiri. Itu konsekuensi yang diterima, bukan
   * kelalaian — penilaiannya tercatat atas namanya di audit log dan pada timeline
   * klaim, dan keputusan Not Effective selalu disertai catatan yang terbaca semua
   * pihak.
   */
  "monitoring.setEffectiveness": {
    roles: { QA: "ALL", QA_HEAD: "ALL", FACTORY_MGR: "ALL", PRESDIR: "ALL" },
    statuses: ["CAPA_MONITORING"],
  },
  "monitoring.submitReport": {
    roles: { QA: "ALL", QA_HEAD: "ALL", ADMIN: "ALL" },
    statuses: ["CAPA_MONITORING"],
  },
  /**
   * Lembar CAPA Implementation Monitoring.
   *
   * Statusnya lebih sempit daripada `cpar.print`: lembar ini mencetak periode siklus
   * berjalan, dan sebelum pemantauan dibuka belum ada periode sama sekali. Tombol yang
   * tampil di `CPAR_APPROVED` hanya akan menghasilkan lembar dengan tabel kosong.
   *
   * `CPAR_REVISION` sesudah Not Effective juga tidak termasuk, dengan sebab yang sama:
   * siklusnya sudah naik, dan periode siklus baru belum dibuat.
   */
  "monitoring.print": {
    roles: READ_ONLY_FOR_EVERYONE,
    statuses: ["CAPA_MONITORING", "VERIFIED_CLOSED"],
  },

  "audit.view": { roles: READ_ONLY_FOR_EVERYONE, statuses: "ANY" },
  "notification.viewLog": { roles: { QA_HEAD: "ALL", ADMIN: "ALL" }, statuses: null },
  "master.manage": { roles: { ADMIN: "ALL" }, statuses: null },
  "user.manage": { roles: { ADMIN: "ALL" }, statuses: null },
};

// ─────────────────────── Section CPAR → role pengisi ───────────────────────

/**
 * Asumsi A-03 (dikonfirmasi): Factory Manager dan President Director tidak mengisi
 * section mana pun — kontribusi mereka lewat cpar.verify dan monitoring.setEffectiveness.
 * Section yang bukan hak seseorang tampil read-only (§6 Modul 3).
 */
export const CPAR_SECTION_OWNERS: Record<CparSectionKey, readonly RoleCode[]> = {
  PROBLEM_DESCRIPTION: ["QA"],
  TEMPORARY_ACTION: ["USER_DEPT", "QA"],
  // Diagram alur proses digambar departemen pelaksana; QA ikut karena merekalah yang
  // memetakan proses lintas departemen saat penanganannya bertipe CFT.
  PROCESS_FLOW: ["USER_DEPT", "QA"],
  // QA ikut melengkapi analisis dan tindak lanjutnya, bukan menggantikan departemen
  // pelaksana: merekalah yang mendampingi penelusuran akar masalah dan yang tahu part
  // atau line lain pernah mengalami cacat serupa. Keputusan verifikasi tetap terpisah —
  // QA Staff tidak termasuk kapasitas verifier mana pun, jadi tidak ada yang menilai
  // pekerjaannya sendiri.
  ROOT_CAUSE_OCCURRENCE: ["USER_DEPT", "QA"],
  ROOT_CAUSE_OUTFLOW: ["USER_DEPT", "QA"],
  PERMANENT_COUNTERMEASURE: ["USER_DEPT", "QA"],
  STANDARDIZATION_HORIZONTAL: ["USER_DEPT", "USER_HEAD", "QA"],
  // Dicabut dari pengisian CPAR (lihat RETIRED_SECTIONS di lib/cpar.ts): efektivitas
  // dinilai di Modul 4 setelah perbaikannya dikerjakan, bukan dijanjikan di lembar yang
  // sama. Daftar pengisinya dikosongkan, bukan hanya tombolnya dihilangkan dari layar —
  // `canFillSection` menjadi false untuk semua orang, sehingga server action yang
  // dipanggil langsung pun menolaknya.
  EFFECTIVENESS_PLAN: [],
};

/**
 * Verifier wajib per siklus (§5, asumsi A-01 & A-04 — keduanya dikonfirmasi).
 * Sama untuk semua tipe klaim; pada CPAR bertipe CFT kapasitas User Dept. Head hanya
 * dipegang satu orang yang ditunjuk dari Main Responsible Department.
 */
export const REQUIRED_VERIFIER_ROLES = [
  "QA_HEAD",
  "USER_HEAD",
  "FACTORY_MGR",
  "PRESDIR",
] as const satisfies readonly RoleCode[];

export function requiredVerifierRoles(): readonly RoleCode[] {
  return REQUIRED_VERIFIER_ROLES;
}

// ─────────────────────────── Evaluasi ───────────────────────────

function isDeptInvolved(actor: Actor, claim: ClaimContext): boolean {
  const departmentId = actor.departmentId;
  if (!departmentId) return false;

  return claim.cpars.some(
    (cpar) =>
      cpar.responsibleDeptId === departmentId || cpar.cftMemberDeptIds.includes(departmentId),
  );
}

function satisfiesScope(scope: Scope, actor: Actor, claim: ClaimContext | null): boolean {
  if (scope === "ALL") return true;
  if (!claim) return false;
  if (scope === "OWNER") return claim.createdById === actor.id;
  return isDeptInvolved(actor, claim);
}

/**
 * Klaim yang belum punya CPAR belum menunjuk departemen mana pun. Klaim PUBLISHED dan
 * IGNORED tetap terlihat oleh semua orang karena keduanya memicu broadcast ke seluruh
 * user portal (§8 #3 dan #5) — asumsi A-07.
 */
const BROADCAST_STATUSES = ["PUBLISHED", "IGNORED"] as const satisfies readonly ClaimStatus[];

function isBroadcastStatus(status: ClaimStatus): boolean {
  return (BROADCAST_STATUSES as readonly ClaimStatus[]).includes(status);
}

export function canViewClaim(actor: Actor, claim: ClaimContext): boolean {
  const deptScopedRoles: readonly RoleCode[] = ["USER_DEPT", "USER_HEAD"];
  const hasWideRole = actor.roles.some((role) => !deptScopedRoles.includes(role));

  if (hasWideRole) return true;
  if (isDeptInvolved(actor, claim)) return true;

  return isBroadcastStatus(claim.status);
}

export function can(actor: Actor, action: Action, claim: ClaimContext | null = null): boolean {
  const rule = PERMISSION_MATRIX[action];

  if (rule.statuses !== null) {
    if (!claim) return false;
    if (rule.statuses !== "ANY" && !rule.statuses.includes(claim.status)) return false;
    if (!canViewClaim(actor, claim)) return false;
  }

  // Satu-satunya hak yang tidak berasal dari role: orang yang ditunjuk mengisi kapasitas
  // User Dept. Head saat CPAR diterbitkan. Penunjukan itu ada justru karena role tidak
  // selalu cukup — bila main responsible department-nya QA, tidak ada pemegang USER_HEAD
  // di sana, dan tanpa jalur ini rantai verifikasi tidak akan pernah lengkap.
  //
  // Cukup ditunjuk pada **salah satu** CPAR klaim ini. Penunjukan berlaku per CPAR, dan
  // yang memastikan ia hanya memverifikasi CPAR yang benar adalah aksinya sendiri, yang
  // selalu dipanggil atas satu CPAR tertentu.
  if (
    action === "cpar.verify" &&
    claim?.cpars.some((cpar) => cpar.userHeadVerifierId === actor.id)
  ) {
    return true;
  }

  return actor.roles.some((role) => {
    const scope = rule.roles[role];
    return scope !== undefined && satisfiesScope(scope, actor, claim);
  });
}

export function assertCan(actor: Actor, action: Action, claim: ClaimContext | null = null): void {
  if (can(actor, action, claim)) return;

  const rule = PERMISSION_MATRIX[action];
  const roleWouldAllow = actor.roles.some((role) => rule.roles[role] !== undefined);

  // Membedakan "role Anda memang tidak berwenang" dari "klaim sudah berpindah status".
  // Keduanya sama-sama 403, tapi yang kedua biasanya terjadi karena halaman sudah basi,
  // dan pengguna perlu tahu bahwa memuat ulang akan menyelesaikannya.
  if (
    roleWouldAllow &&
    claim &&
    rule.statuses !== null &&
    rule.statuses !== "ANY" &&
    !rule.statuses.includes(claim.status)
  ) {
    throw new ForbiddenError(
      `Tindakan ini tidak tersedia saat klaim berstatus ${claim.status}. ` +
        "Halaman Anda mungkin sudah tidak mutakhir — muat ulang untuk melihat keadaan terkini.",
      action,
    );
  }

  throw new ForbiddenError(`Anda tidak berhak melakukan "${action}" pada klaim ini.`, action);
}

/** Apakah aktor boleh mengisi satu section CPAR tertentu (§6 Modul 3, PLAN §2.3). */
export function canFillSection(actor: Actor, section: CparSectionKey, claim: ClaimContext): boolean {
  if (!can(actor, "cpar.section.fill", claim)) return false;

  const owners = CPAR_SECTION_OWNERS[section];
  return actor.roles.some((role) => owners.includes(role));
}

export function assertCanFillSection(
  actor: Actor,
  section: CparSectionKey,
  claim: ClaimContext,
): void {
  if (!canFillSection(actor, section, claim)) {
    throw new ForbiddenError(
      `Section ${section} bukan bagian Anda; isian ini hanya dapat dibaca.`,
      "cpar.section.fill",
    );
  }
}

/**
 * Filter Prisma yang setara dengan `canViewClaim`, untuk dipakai di daftar klaim
 * dan hitungan dashboard. Keduanya diuji berpasangan di tests/unit/permissions.test.ts.
 */
export function visibleClaimsWhere(actor: Actor): Prisma.ClaimWhereInput {
  const deptScopedRoles: readonly RoleCode[] = ["USER_DEPT", "USER_HEAD"];
  const hasWideRole = actor.roles.some((role) => !deptScopedRoles.includes(role));

  if (hasWideRole) return {};

  if (!actor.departmentId) {
    return { status: { in: [...BROADCAST_STATUSES] } };
  }

  return {
    OR: [
      // Cukup satu CPAR yang menyentuh departemennya. Satu klaim dapat menerbitkan
      // beberapa CPAR ke departemen yang berbeda-beda, dan tiap departemen berhak
      // melihat klaimnya begitu salah satunya menjadi tanggungannya.
      { cpars: { some: { responsibleDeptId: actor.departmentId } } },
      { cpars: { some: { cftMembers: { some: { departmentId: actor.departmentId } } } } },
      { status: { in: [...BROADCAST_STATUSES] } },
    ],
  };
}

/** Prefix route yang hanya boleh diakses role tertentu — dipakai middleware. */
export const ROUTE_GUARDS: readonly { readonly prefix: string; readonly roles: readonly RoleCode[] }[] = [
  { prefix: "/master", roles: ["ADMIN"] },
  { prefix: "/notifications", roles: ["QA_HEAD", "ADMIN"] },
];

export function routeAllowed(pathname: string, roles: readonly RoleCode[]): boolean {
  const guard = ROUTE_GUARDS.find(
    (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`),
  );

  if (!guard) return true;

  return guard.roles.some((role) => roles.includes(role));
}
