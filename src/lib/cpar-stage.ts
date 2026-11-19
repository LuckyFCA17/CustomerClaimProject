import type { StatusTone } from "@/config/claim-status";
import type { ClaimStatus, CparStatus } from "@/generated/prisma/enums";

/**
 * Tahap CPAR sebagai nilai murni: urutan kemajuan, pemetaan ke status klaim, dan label.
 *
 * Dipisahkan dari `server/claim-status.ts` supaya halaman dapat memakainya tanpa ikut
 * menarik klien basis data. Yang menghitung status klaim tetap satu tempat; yang ada di
 * sini hanyalah bahan yang dipakainya.
 */

/**
 * Urutan kemajuan tahap CPAR.
 *
 * `REVISION` sengaja berperingkat **di bawah** `UNDER_VERIFICATION` meski terjadi
 * sesudahnya: CPAR yang dikembalikan untuk revisi kembali menjadi pekerjaan yang belum
 * selesai. Mengurutkannya menurut kronologi akan membuat klaim dengan satu CPAR yang
 * ditolak terbaca lebih maju daripada klaim yang CPAR-nya sedang diperiksa dengan
 * tenang.
 */
export const CPAR_STAGE_ORDER: Record<CparStatus, number> = {
  ISSUED: 0,
  IN_PROGRESS: 1,
  REVISION: 2,
  UNDER_VERIFICATION: 3,
  APPROVED: 4,
  MONITORING: 5,
  CLOSED: 6,
};

/** Tahap CPAR → status klaim. Satu lawan satu; dulu keduanya memang satu nilai. */
export const CPAR_STAGE_CLAIM_STATUS: Record<CparStatus, ClaimStatus> = {
  ISSUED: "CPAR_ISSUED",
  IN_PROGRESS: "CPAR_IN_PROGRESS",
  UNDER_VERIFICATION: "CPAR_UNDER_VERIFICATION",
  REVISION: "CPAR_REVISION",
  APPROVED: "CPAR_APPROVED",
  MONITORING: "CAPA_MONITORING",
  CLOSED: "VERIFIED_CLOSED",
};

/** Label yang dibaca orang pada daftar CPAR sebuah klaim. */
export const CPAR_STAGE_LABEL: Record<CparStatus, string> = {
  ISSUED: "Terbit, belum diisi",
  IN_PROGRESS: "Sedang diisi",
  UNDER_VERIFICATION: "Menunggu verifikasi",
  REVISION: "Diminta revisi",
  APPROVED: "Disetujui",
  MONITORING: "Pemantauan CAPA",
  CLOSED: "Selesai",
};

/**
 * Tahap paling tertinggal di antara CPAR yang diberikan; `null` bila tidak ada CPAR.
 *
 * Inilah tahap yang mewakili klaimnya: pertanyaan "klaim ini sampai mana" selalu dijawab
 * dengan pekerjaan yang belum selesai, bukan yang sudah.
 */
export function leastAdvancedStage(stages: readonly CparStatus[]): CparStatus | null {
  let lowest: CparStatus | null = null;

  for (const stage of stages) {
    if (lowest === null || CPAR_STAGE_ORDER[stage] < CPAR_STAGE_ORDER[lowest]) lowest = stage;
  }

  return lowest;
}

/** Status klaim yang seharusnya, menurut tahap seluruh CPAR-nya. */
export function claimStatusFor(stages: readonly CparStatus[]): ClaimStatus | null {
  const stage = leastAdvancedStage(stages);

  return stage === null ? null : CPAR_STAGE_CLAIM_STATUS[stage];
}

/**
 * CPAR yang mewakili klaimnya pada tampilan yang hanya punya ruang untuk satu.
 *
 * Yang dipilih adalah yang **paling tertinggal**, bukan yang pertama terbit: tenggat dan
 * rel status di kepala halaman harus bercerita tentang pekerjaan yang belum selesai,
 * sejalan dengan status klaimnya yang juga diturunkan dari CPAR yang sama. Memilih yang
 * pertama terbit akan membuat daftar menyatakan "selesai" sementara CPAR kedua masih
 * berjalan.
 */
export function leadCpar<T extends { status: CparStatus }>(cpars: readonly T[]): T | null {
  if (cpars.length === 0) return null;

  return cpars.reduce((lowest, candidate) =>
    CPAR_STAGE_ORDER[candidate.status] < CPAR_STAGE_ORDER[lowest.status] ? candidate : lowest,
  );
}

/**
 * Warna tahap CPAR, memakai tone yang sama dengan badge status klaim.
 *
 * Satu klaim kini dapat menampilkan badge status klaim dan beberapa badge tahap CPAR
 * berdampingan. Bila keduanya memakai sistem warna yang berbeda, pembaca akan menduga
 * keduanya mengukur hal yang berbeda — padahal status klaim justru **diturunkan** dari
 * tahap-tahap ini.
 */
export const CPAR_STAGE_TONE: Record<CparStatus, StatusTone> = {
  ISSUED: "published",
  IN_PROGRESS: "published",
  UNDER_VERIFICATION: "pending",
  REVISION: "pending",
  APPROVED: "published",
  MONITORING: "monitoring",
  CLOSED: "closed",
};
