import { describe, expect, it } from "vitest";

import {
  CLAIM_STATUS_META,
  CLAIM_STATUSES,
  RAIL_STAGES,
  STATUS_TONE_CLASS,
  statusMeta,
  type ClaimStatus,
} from "@/config/claim-status";

describe("claim status metadata", () => {
  it("mendefinisikan meta untuk setiap status, tanpa entri liar", () => {
    expect(Object.keys(CLAIM_STATUS_META).sort()).toEqual([...CLAIM_STATUSES].sort());
  });

  it("menempatkan setiap status pada tahap status rail yang valid", () => {
    for (const status of CLAIM_STATUSES) {
      const meta = statusMeta(status);
      expect(meta.stage, status).toBeGreaterThanOrEqual(0);
      expect(meta.stage, status).toBeLessThan(RAIL_STAGES.length);
    }
  });

  it("memakai tone yang punya kelas warna", () => {
    for (const status of CLAIM_STATUSES) {
      expect(STATUS_TONE_CLASS[statusMeta(status).tone], status).toBeTruthy();
    }
  });

  it("menandai tepat dua status terminal (§5)", () => {
    const terminal = CLAIM_STATUSES.filter((status) => statusMeta(status).terminal);
    expect(terminal).toEqual<ClaimStatus[]>(["IGNORED", "VERIFIED_CLOSED"]);
  });

  it("menandai status revisi sebagai langkah mundur agar rail menggambar garis balik", () => {
    const reverted = CLAIM_STATUSES.filter((status) => statusMeta(status).reverted);
    expect(reverted).toEqual<ClaimStatus[]>(["REVISION_REQUESTED", "CPAR_REVISION"]);
  });

  it("memberi label dan hint yang tidak kosong untuk setiap status", () => {
    for (const status of CLAIM_STATUSES) {
      const meta = statusMeta(status);
      expect(meta.label.length, status).toBeGreaterThan(0);
      expect(meta.hint.length, status).toBeGreaterThan(0);
    }
  });

  it("menaruh VERIFIED_CLOSED pada tahap terakhir rail", () => {
    expect(statusMeta("VERIFIED_CLOSED").stage).toBe(RAIL_STAGES.length - 1);
  });
});
