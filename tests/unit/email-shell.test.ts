import { describe, expect, it } from "vitest";

import { withOutlookGhostTable } from "@/emails/primitives";
import { renderClaimEmail } from "@/emails/templates";
import type { ClaimEmailPayload } from "@/emails/types";

/**
 * Kontrak kerangka email.
 *
 * Lebar sesungguhnya diukur di peramban oleh `pnpm mail:width`; yang dijaga di sini
 * adalah hal-hal yang dapat dibaca langsung dari HTML dan paling mudah hilang tanpa
 * disadari saat template disunting — terutama ghost table Outlook, yang dipasang pada
 * HTML jadi dan karenanya tidak terlihat sama sekali di berkas JSX.
 */

const payload: ClaimEmailPayload = {
  claimId: "contoh",
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
  qualityProblem: "Clip patah pada kaki pengunci.",
  actorName: "Dimas Prayoga",
  actorJobTitle: "QA Staff",
  portalUrl: "http://localhost:3000/claims/contoh",
};

describe("withOutlookGhostTable", () => {
  it("mengganti penanda menjadi conditional comment", () => {
    const html = withOutlookGhostTable('<td><div data-mso="open"></div>isi<div data-mso="close"></div></td>');

    expect(html).toContain('<!--[if mso]><table width="600"');
    expect(html).toContain("<!--[if mso]></td></tr></table><![endif]-->");
    expect(html).not.toContain("data-mso");
  });

  it("membiarkan HTML tanpa penanda apa adanya", () => {
    expect(withOutlookGhostTable("<p>halo</p>")).toBe("<p>halo</p>");
  });
});

describe("kerangka email yang dirender", () => {
  it("memasang ghost table dan tidak meninggalkan satu pun penanda", async () => {
    const { html } = await renderClaimEmail("CLAIM_REVIEW_REQUEST", payload);

    // Dua separuh ghost table harus hadir berpasangan; satu saja berarti Outlook
    // menerima tabel yang tidak pernah ditutup.
    expect(html).toContain('<!--[if mso]><table width="600"');
    expect(html).toContain("<!--[if mso]></td></tr></table><![endif]-->");
    expect(html).not.toContain("data-mso");
  });

  it("membuat kartu cair dengan batas 600px, bukan lebar tetap", async () => {
    const { html } = await renderClaimEmail("CLAIM_REVIEW_REQUEST", payload);

    // Inilah cacat yang pernah lolos: `width:600px` pada kartu membuat email 624px di
    // layar 360px, dan `max-width:100%` tidak pernah menolongnya karena sel induknya
    // ikut melebar. Batas lebar kini dipegang div pembungkus.
    expect(html).toMatch(/max-width:\s*600px/);
    // Lookbehind-nya perlu: "max-width:600px" memuat "width:600px" sebagai substring,
    // sehingga pencocokan polos akan selalu gagal walau markupnya sudah benar.
    expect(html).not.toMatch(/(?<!max-)width:\s*600px/);
    expect(html).toMatch(/<table width="100%"[^>]*style="width:100%;background-color/);
  });

  it("tidak mengubah versi teks", async () => {
    const { text } = await renderClaimEmail("CLAIM_REVIEW_REQUEST", payload);

    expect(text).not.toContain("[if mso]");
    expect(text).toContain("NID/CC/26/99/0001");
  });
});
