import { describe, expect, it } from "vitest";

import { hasTemplate, renderClaimEmail, renderSubject } from "@/emails/templates";
import { NOTIFICATION_LABEL } from "@/emails/types";
import type { ClaimEmailPayload } from "@/emails/types";
import { NotificationType } from "@/generated/prisma/enums";

const payload: ClaimEmailPayload = {
  claimId: "cmvkl07fv000lsh7d7wa638ny",
  claimNo: "NID/CC/26/10/0005",
  claimType: "Official",
  statusLabel: "Pending QA Head review",
  partName: "Clip Fastener Bumper",
  internalPartNo: "NID-4451-02",
  customerPartNo: "90467-09201",
  customerName: "PT Toyota Motor Manufacturing Indonesia",
  ncDetail: "Crack / Broken",
  productCategory: "Critical Part",
  dateOfOccurrence: "18 Okt 2026",
  dateOfReceived: "20 Okt 2026",
  qualityProblem: "Clip patah pada kaki pengunci saat pemasangan bumper.",
  actorName: "Dimas Prayoga",
  actorJobTitle: "QA Staff",
  portalUrl: "https://ncc.nifco.co.id/claims/cmvkl07fv000lsh7d7wa638ny",
  attachmentNames: ["NID-CC-26-10-0005_bad-news_v1.pdf"],
};

/** Jenis yang modulnya sudah dibangun; sisanya menyusul bersama modulnya. */
const FASE_3_TYPES = [
  "CLAIM_REVIEW_REQUEST",
  "CLAIM_REVISION_REQUEST",
  "NEW_CUSTOMER_CLAIM",
] as const;

const MODUL_2_TYPES = ["CPAR_REQUEST", "CLAIM_IGNORATION"] as const;

const MODUL_3_TYPES = ["CPAR_REVIEW_REQUEST", "CPAR_REVISION_REQUEST", "CPAR_APPROVED"] as const;

const MODUL_4_TYPES = [
  "MONITORING_EVIDENCE_REQUEST",
  "CAPA_NOT_EFFECTIVE",
  "MONITORING_FINISHED",
] as const;

/** Ketiganya dipicu cron, bukan tindakan pengguna; template-nya menyusul pada Fase 7. */
const BELUM_DIBANGUN = [
  "CPAR_DAILY_REMINDER",
  "CPAR_REVIEW_REMINDER",
  "MONITORING_WEEKLY_REMINDER",
] as const;

describe("kelengkapan template", () => {
  it("memberi label untuk keempat belas jenis notifikasi §8", () => {
    const types = Object.values(NotificationType);

    expect(types).toHaveLength(14);
    for (const type of types) {
      expect(NOTIFICATION_LABEL[type], type).toBeTruthy();
    }
  });

  it("baru menyediakan template untuk jenis yang modulnya sudah dibangun", () => {
    for (const type of [...FASE_3_TYPES, ...MODUL_2_TYPES, ...MODUL_3_TYPES, ...MODUL_4_TYPES]) {
      expect(hasTemplate(type), type).toBe(true);
    }

    for (const type of BELUM_DIBANGUN) {
      expect(hasTemplate(type), type).toBe(false);
    }
  });

  it("menolak merender jenis yang templatenya belum ada, alih-alih mengirim email kosong", async () => {
    await expect(renderClaimEmail("CPAR_REVIEW_REMINDER", payload)).rejects.toThrow(/belum dibuat/);
  });
});

describe("subject", () => {
  it("memuat nomor klaim dan nama part supaya terbaca di daftar kotak masuk", () => {
    for (const type of FASE_3_TYPES) {
      const subject = renderSubject(type, payload);

      expect(subject, type).toContain("NID/CC/26/10/0005");
      expect(subject, type).toContain("Clip Fastener Bumper");
      expect(subject, type).toMatch(/^\[NCC\]/);
    }
  });

  it("membedakan ketiga jenis notifikasi", () => {
    const subjects = FASE_3_TYPES.map((type) => renderSubject(type, payload));

    expect(new Set(subjects).size).toBe(3);
  });
});

describe("notifikasi Modul 2", () => {
  const cparPayload = {
    ...payload,
    cparNo: "NID/CPAR/26/0002",
    responsibleDept: "Production",
    cftMembers: ["Engineering", "PPIC & Warehouse"],
    initialDocuments: ["4M Change Sheet", "Inspection Standard"],
    dueDate: "28 Okt 2026",
  };

  it("menyebut CPAR No., penanggung jawab, dan tenggat pada CPAR request", async () => {
    const { html } = await renderClaimEmail("CPAR_REQUEST", cparPayload);

    expect(html).toContain("NID/CPAR/26/0002");
    expect(html).toContain("Production");
    expect(html).toContain("28 Okt 2026");
  });

  it("mendaftar dokumen yang diminta dan anggota CFT", async () => {
    const { html } = await renderClaimEmail("CPAR_REQUEST", cparPayload);

    expect(html).toContain("4M Change Sheet");
    expect(html).toContain("Inspection Standard");
    expect(html).toContain("Engineering");
  });

  it("memakai CPAR No. pada subject, bukan nomor klaim", async () => {
    expect(renderSubject("CPAR_REQUEST", cparPayload)).toContain("NID/CPAR/26/0002");
  });

  it("menampilkan alasan penutupan pada notifikasi ignoration", async () => {
    const reason = "Part yang diklaim bukan produksi NID; nomor lot milik pemasok lain.";
    const { html, text } = await renderClaimEmail("CLAIM_IGNORATION", { ...payload, comment: reason });

    expect(html).toContain(reason);
    expect(text).toContain("bukan produksi NID");
  });

  it("menyatakan bahwa tidak ada CPAR yang diterbitkan", async () => {
    const { text } = await renderClaimEmail("CLAIM_IGNORATION", { ...payload, comment: "x".repeat(40) });

    expect(text.toLowerCase()).toContain("ignored");
  });
});

describe("badan email", () => {
  it("merender HTML dan versi teks sekaligus", async () => {
    const email = await renderClaimEmail("CLAIM_REVIEW_REQUEST", payload);

    expect(email.html).toContain("<html");
    expect(email.text.length).toBeGreaterThan(50);
    expect(email.text).not.toContain("<table");
  });

  it("memuat ringkasan klaim dalam tabel (§8)", async () => {
    const { html } = await renderClaimEmail("CLAIM_REVIEW_REQUEST", payload);

    expect(html).toContain("NID/CC/26/10/0005");
    expect(html).toContain("Clip Fastener Bumper");
    expect(html).toContain("Crack / Broken");
    expect(html).toContain("PT Toyota Motor Manufacturing Indonesia");
  });

  it("memuat tombol Open in portal berisi deep link klaimnya", async () => {
    const { html } = await renderClaimEmail("NEW_CUSTOMER_CLAIM", payload);

    expect(html).toContain("Open in portal");
    expect(html).toContain("https://ncc.nifco.co.id/claims/cmvkl07fv000lsh7d7wa638ny");
  });

  it("mengarahkan tiap jenis ke halaman yang tepat", async () => {
    const review = await renderClaimEmail("CLAIM_REVIEW_REQUEST", payload);
    const revision = await renderClaimEmail("CLAIM_REVISION_REQUEST", {
      ...payload,
      comment: "Lot no. belum cocok dengan delivery record.",
    });

    // QA Head langsung ke halaman keputusan; QA pembuat klaim langsung ke formulirnya.
    expect(review.html).toContain("/claims/cmvkl07fv000lsh7d7wa638ny/review");
    expect(revision.html).toContain("/claims/cmvkl07fv000lsh7d7wa638ny/edit");
  });

  it("menampilkan komentar revisi apa adanya", async () => {
    const comment = "Lot no. belum cocok dengan delivery record; mohon dicek ulang.";
    const { html, text } = await renderClaimEmail("CLAIM_REVISION_REQUEST", { ...payload, comment });

    expect(html).toContain(comment);
    expect(text).toContain("delivery record");
  });

  it("membuang baris ringkasan yang memang kosong, bukan mencetak tanda hubung", async () => {
    const { html } = await renderClaimEmail("CLAIM_REVIEW_REQUEST", {
      ...payload,
      customerName: null,
      productCategory: null,
    });

    expect(html).not.toContain("Customer</td>");
    expect(html).not.toContain("Product category");
    expect(html).toContain("Non-conformance detail");
  });

  it("memakai header oranye NIFCO pada seluruh jenis (§8)", async () => {
    for (const type of FASE_3_TYPES) {
      const { html } = await renderClaimEmail(type, payload);

      expect(html.toLowerCase(), type).toContain("#e8873a");
      expect(html, type).toContain("NCC PORTAL");
    }
  });

  it("menyebut nama lampiran bila ada", async () => {
    const { html } = await renderClaimEmail("NEW_CUSTOMER_CLAIM", payload);

    expect(html).toContain("NID-CC-26-10-0005_bad-news_v1.pdf");
  });

  it("tidak menyebut lampiran saat memang tidak ada", async () => {
    const { html } = await renderClaimEmail("CLAIM_REVIEW_REQUEST", {
      ...payload,
      attachmentNames: [],
    });

    expect(html).not.toContain("Lampiran:");
  });
});

describe("notifikasi Modul 3", () => {
  const cparPayload = {
    ...payload,
    cparNo: "NID/CPAR/26/0002",
    responsibleDept: "Production",
    cycle: 2,
    cparUrl: "https://ncc.nifco.co.id/cpar/claim-1",
    verifierCapacities: ["QA Dept. Head", "User Dept. Head", "Factory Manager", "President Director"],
  };

  it("menyebut siklus dan keempat kapasitas pada permintaan verifikasi", async () => {
    const { html, subject } = await renderClaimEmail("CPAR_REVIEW_REQUEST", cparPayload);

    expect(subject).toContain("siklus 2");
    expect(html).toContain("NID/CPAR/26/0002");
    expect(html).toContain("Factory Manager");
    expect(html).toContain("President Director");
  });

  it("menautkan ke halaman CPAR, bukan halaman klaim", async () => {
    for (const type of MODUL_3_TYPES) {
      const { html } = await renderClaimEmail(type, cparPayload);

      expect(html, type).toContain("https://ncc.nifco.co.id/cpar/claim-1");
    }
  });

  it("membawa komentar verifier dan section yang ditandai pada permintaan revisi", async () => {
    const { html } = await renderClaimEmail("CPAR_REVISION_REQUEST", {
      ...cparPayload,
      comment: "Root cause occurrence masih berhenti di gejala.",
      targetSections: ["Root cause — occurrence"],
    });

    expect(html).toContain("masih berhenti di gejala");
    expect(html).toContain("Root cause — occurrence");
  });

  it("tidak pernah menulis undefined pada baris preview walau CPAR No. belum ada", async () => {
    // cparNo sengaja dihilangkan: baris preview adalah teks pertama yang terbaca di
    // daftar kotak masuk, dan "undefined menunggu verifikasi Anda" terlihat seperti bug.
    for (const type of MODUL_3_TYPES) {
      const { html, text } = await renderClaimEmail(type, { ...cparPayload, cparNo: null });

      expect(html, type).not.toContain("undefined");
      expect(text, type).not.toContain("undefined");
      expect(html, type).toContain("NID/CC/26/10/0005");
    }
  });
});

describe("notifikasi Modul 4", () => {
  const monitoringPayload = {
    ...payload,
    cparNo: "NID/CPAR/26/0002",
    responsibleDept: "Production",
    cycle: 2,
    cparUrl: "https://ncc.nifco.co.id/monitoring/claim-1",
    periods: ["Periode 1 — 04 Nov 2026", "Periode 2 — 11 Nov 2026"],
  };

  it("mendaftar jadwal periode pada permintaan evidence", async () => {
    const { html, subject } = await renderClaimEmail(
      "MONITORING_EVIDENCE_REQUEST",
      monitoringPayload,
    );

    expect(subject).toContain("Pemantauan CAPA dimulai");
    expect(html).toContain("Periode 1 — 04 Nov 2026");
    expect(html).toContain("Periode 2 — 11 Nov 2026");
  });

  it("menyebut nomor periode yang gagal dan catatan penilainya", async () => {
    const { html, subject } = await renderClaimEmail("CAPA_NOT_EFFECTIVE", {
      ...monitoringPayload,
      periodNo: 2,
      comment: "Masih ditemukan 3 pcs kaki patah pada 500 pcs pertama.",
    });

    expect(subject).toContain("periode 2");
    expect(html).toContain("Masih ditemukan 3 pcs");
    expect(html).toContain("Not Effective");
  });

  it("menyebut Verified Closed dan melampirkan dokumen penutup", async () => {
    const { html, subject } = await renderClaimEmail("MONITORING_FINISHED", {
      ...monitoringPayload,
      comment: "Seal diganti terjadwal, tiga periode nol temuan.",
      attachmentNames: ["NID-CC-26-10-0008_c2_monitoring_v1.pdf", "NID-CC-26-10-0008_c2_a3_v1.pdf"],
    });

    expect(subject).toContain("Verified Closed");
    expect(html).toContain("Seal diganti terjadwal");
    expect(html).toContain("a3_v1.pdf");
  });

  it("tidak pernah menulis undefined walau CPAR No. belum ada", async () => {
    for (const type of MODUL_4_TYPES) {
      const { html, text } = await renderClaimEmail(type, { ...monitoringPayload, cparNo: null });

      expect(html, type).not.toContain("undefined");
      expect(text, type).not.toContain("undefined");
    }
  });
});
