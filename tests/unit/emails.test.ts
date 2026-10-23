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

/** Tiga jenis yang dipicu Modul 1; sebelas sisanya menyusul bersama modulnya. */
const FASE_3_TYPES = [
  "CLAIM_REVIEW_REQUEST",
  "CLAIM_REVISION_REQUEST",
  "NEW_CUSTOMER_CLAIM",
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
    for (const type of FASE_3_TYPES) {
      expect(hasTemplate(type), type).toBe(true);
    }

    expect(hasTemplate("CPAR_REQUEST")).toBe(false);
  });

  it("menolak merender jenis yang templatenya belum ada, alih-alih mengirim email kosong", async () => {
    await expect(renderClaimEmail("CPAR_REQUEST", payload)).rejects.toThrow(/belum dibuat/);
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
