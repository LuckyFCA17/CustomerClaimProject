import type { NotificationType } from "@/generated/prisma/enums";
import type { ClaimEmailPayload } from "@/emails/types";

/**
 * Data contoh untuk setiap jenis notifikasi.
 *
 * Dipakai bersama oleh `pnpm mail:test` (mengirimnya) dan `pnpm mail:width` (mengukur
 * lebarnya). Satu sumber, supaya email yang diukur benar-benar email yang dikirim —
 * contoh yang disalin akan berbeda diam-diam begitu salah satunya disunting.
 */

const portal = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const claimUrl = `${portal}/claims/contoh-klaim`;
const cparUrl = `${portal}/cpar/contoh-cpar`;

/**
 * Data contoh.
 *
 * Nomor klaimnya sengaja memakai bulan 99 — `NID/CC/26/99/0001` tidak mungkin
 * diterbitkan portal, sehingga email uji tidak pernah tertukar dengan email sungguhan di
 * kotak masuk yang sama.
 */
const base: ClaimEmailPayload = {
  claimId: "contoh-klaim",
  claimNo: "NID/CC/26/99/0001",
  claimType: "Customer Claim",
  statusLabel: "Waiting review",
  partName: "Clip Fastener Bumper",
  internalPartNo: "NID-4451-02",
  customerPartNo: "90467-09260",
  customerName: "PT Denso Indonesia",
  ncDetail: "Crack / Broken",
  productCategory: "Interior Fastener",
  dateOfOccurrence: "26 Okt 2026",
  dateOfReceived: "28 Okt 2026",
  qualityProblem:
    "Clip patah pada kaki pengunci saat pemasangan di line perakitan; ditemukan 7 pcs dari 1.200 pcs kiriman.",
  actorName: "Dimas Prayoga",
  actorJobTitle: "QA Staff",
  portalUrl: claimUrl,
  attachmentNames: ["bad-news-information.pdf", "quick-information.pdf"],
};

const cpar: ClaimEmailPayload = {
  ...base,
  cparNo: "NID/CPAR/26/0007",
  responsibleDept: "Production",
  cycle: 2,
  cparUrl,
};

/**
 * Isi per jenis notifikasi.
 *
 * Tiap contoh diisi sampai cabang opsional templatenya ikut terender — catatan verifier,
 * daftar kapasitas, jadwal periode, daftar dokumen. Contoh yang terlalu bersih membuat
 * pengujian ini melewatkan justru bagian yang paling mudah rusak di ponsel: daftar
 * bertitik dan blok catatan yang lebarnya tidak dibatasi.
 */
export const SAMPLES: Record<NotificationType, ClaimEmailPayload> = {
  CLAIM_REVIEW_REQUEST: base,

  CLAIM_REVISION_REQUEST: {
    ...base,
    statusLabel: "Revision",
    actorName: "Rina Kusuma",
    actorJobTitle: "QA Dept. Head",
    comment:
      "Foto bagian yang patah belum terlampir, dan jumlah temuan pada quality problem belum cocok dengan laporan sortir. Mohon diperbaiki sebelum diterbitkan.",
  },

  NEW_CUSTOMER_CLAIM: {
    ...base,
    statusLabel: "Published",
    actorName: "Rina Kusuma",
    actorJobTitle: "QA Dept. Head",
  },

  CPAR_REQUEST: {
    ...cpar,
    cycle: null,
    statusLabel: "CPAR filling",
    actorName: "Rina Kusuma",
    actorJobTitle: "QA Dept. Head",
    dueDate: "05 Nov 2026",
    cftMembers: [
      "Bambang Setiawan (Production Dept. Head)",
      "Yusuf Ramadhan (Engineering Staff)",
      "Anita Rahmawati (PPIC Staff)",
    ],
    initialDocuments: [
      "4M Change Point Sheet",
      "Inspection Standard terbaru",
      "Laporan sortir 1.200 pcs",
    ],
    comment: "Mohon libatkan Maintenance bila akar masalahnya menyangkut kondisi mesin.",
  },

  CLAIM_IGNORATION: {
    ...base,
    statusLabel: "Ignored",
    actorName: "Rina Kusuma",
    actorJobTitle: "QA Dept. Head",
    comment:
      "Setelah ditelusuri, kerusakan terjadi pada proses pemasangan di pihak pelanggan, bukan pada part. Hasil pemeriksaan dan foto terlampir di portal.",
  },

  CPAR_DAILY_REMINDER: {
    ...cpar,
    cycle: 1,
    statusLabel: "CPAR filling",
    dueDate: "29 Okt 2026",
  },

  CPAR_REVIEW_REQUEST: {
    ...cpar,
    statusLabel: "CPAR review",
    actorName: "Bambang Setiawan",
    actorJobTitle: "Production Dept. Head",
    verifierCapacities: [
      "QA Dept. Head",
      "User Dept. Head",
      "Factory Manager",
      "President Director",
    ],
  },

  CPAR_REVIEW_REMINDER: {
    ...cpar,
    statusLabel: "CPAR review",
    verifierCapacities: ["Factory Manager", "President Director"],
  },

  CPAR_REVISION_REQUEST: {
    ...cpar,
    cycle: 3,
    statusLabel: "CPAR revision",
    actorName: "Toshiro Tanaka",
    actorJobTitle: "Factory Manager",
    comment:
      "Root cause outflow masih menyebut “kelalaian operator” tanpa 5-Why sampai akar. Permanent countermeasure juga belum punya PIC dan tanggal implementasi.",
    targetSections: [
      "Root cause — outflow",
      "Permanent countermeasure",
      "Standardization & horizontal deployment",
    ],
  },

  CPAR_APPROVED: {
    ...cpar,
    statusLabel: "CAPA monitoring",
    verifierCapacities: [
      "QA Dept. Head",
      "User Dept. Head",
      "Factory Manager",
      "President Director",
    ],
  },

  CPAR_EVIDENCE_REQUEST: {
    ...cpar,
    statusLabel: "CPAR filling",
    actorName: "Bambang Setiawan",
    actorJobTitle: "Production Dept. Head",
    picName: "Yusuf Ramadhan",
    requestedItems: [
      "Permanent countermeasure — pasang alarm tekanan pada mesin 5 (implementasi 03 Nov 2026)",
      "Standardization — revisi Work Instruction WI-ASM-114",
      "Initial document — 4M Change Point Sheet",
    ],
    dueDate: "05 Nov 2026",
  },

  MONITORING_EVIDENCE_REQUEST: {
    ...cpar,
    statusLabel: "CAPA monitoring",
    actorName: "Rina Kusuma",
    actorJobTitle: "QA Dept. Head",
    periods: [
      "Periode 1 — 10 Nov 2026",
      "Periode 2 — 17 Nov 2026",
      "Periode 3 — 24 Nov 2026",
    ],
  },

  MONITORING_WEEKLY_REMINDER: {
    ...cpar,
    statusLabel: "CAPA monitoring",
    periodNo: 2,
    dueDate: "17 Nov 2026",
  },

  CAPA_NOT_EFFECTIVE: {
    ...cpar,
    cycle: 3,
    statusLabel: "CPAR revision",
    actorName: "Dimas Prayoga",
    actorJobTitle: "QA Staff",
    periodNo: 2,
    comment:
      "Keluhan serupa muncul kembali pada lot 26-0810: 3 pcs kaki patah dari 500 pcs pertama. Alarm tekanan pada mesin 5 belum terpasang sesuai rencana.",
  },

  MONITORING_FINISHED: {
    ...cpar,
    statusLabel: "Verified closed",
    actorName: "Rina Kusuma",
    actorJobTitle: "QA Dept. Head",
    periods: [
      "Periode 1 — Effective",
      "Periode 2 — Effective",
      "Periode 3 — Effective",
    ],
    comment: "Tidak ada temuan berulang selama tiga periode. Improvement Report tersimpan.",
  },
};
