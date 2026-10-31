import { describe, expect, it } from "vitest";

import { SECTION_ORDER, isSectionFilled } from "@/lib/cpar";
import { CPAR_SECTION_OWNERS } from "@/lib/permissions";
import {
  PROCESS_STEP_MAX,
  flowCompleteness,
  hasProcessFlow,
  processFlowSchema,
  processStepSchema,
  readProcessFlow,
} from "@/schemas/process-flow";

const injection = { name: "Injection", suspectOccurrence: true, suspectOutflow: false };
const inspection = { name: "Final inspection", suspectOccurrence: false, suspectOutflow: true };

describe("penempatan section", () => {
  it("berada sesudah temporary action dan sebelum kedua analisis akar masalah", () => {
    const order = SECTION_ORDER as readonly string[];

    expect(order.indexOf("PROCESS_FLOW")).toBeGreaterThan(order.indexOf("TEMPORARY_ACTION"));
    expect(order.indexOf("PROCESS_FLOW")).toBeLessThan(order.indexOf("ROOT_CAUSE_OCCURRENCE"));
    expect(order.indexOf("PROCESS_FLOW")).toBeLessThan(order.indexOf("ROOT_CAUSE_OUTFLOW"));
  });

  it("punya pemilik yang berhak mengisinya", () => {
    expect(CPAR_SECTION_OWNERS.PROCESS_FLOW.length).toBeGreaterThan(0);
  });
});

describe("processStepSchema", () => {
  it("menerima proses dengan kedua tanda suspek sekaligus", () => {
    const result = processStepSchema.safeParse({
      name: "Assembly",
      suspectOccurrence: true,
      suspectOutflow: true,
    });

    expect(result.success).toBe(true);
  });

  it("menganggap proses tanpa tanda sebagai bukan suspek", () => {
    const result = processStepSchema.safeParse({ name: "Packing" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.suspectOccurrence).toBe(false);
      expect(result.data.suspectOutflow).toBe(false);
    }
  });

  it("menolak nama proses yang kosong", () => {
    expect(processStepSchema.safeParse({ name: "   " }).success).toBe(false);
  });
});

describe("processFlowSchema", () => {
  it("membatasi jumlah proses", () => {
    const steps = Array.from({ length: PROCESS_STEP_MAX + 1 }, () => injection);

    expect(processFlowSchema.safeParse({ steps }).success).toBe(false);
  });

  it("menerima alur kosong — diagram boleh belum digambar", () => {
    expect(processFlowSchema.safeParse({ steps: [] }).success).toBe(true);
  });
});

describe("flowCompleteness", () => {
  it("belum lengkap tanpa satu pun proses", () => {
    const result = flowCompleteness({ steps: [], note: "" });

    expect(result.isComplete).toBe(false);
    expect(result.missing.join(" ")).toMatch(/urutan prosesnya belum diisi/);
  });

  it("belum lengkap bila occurrence belum ditandai", () => {
    const result = flowCompleteness({ steps: [inspection], note: "" });

    expect(result.isComplete).toBe(false);
    expect(result.missing.join(" ")).toMatch(/suspek occurrence/);
    expect(result.missing.join(" ")).not.toMatch(/suspek outflow/);
  });

  it("belum lengkap bila outflow belum ditandai", () => {
    const result = flowCompleteness({ steps: [injection], note: "" });

    expect(result.isComplete).toBe(false);
    expect(result.missing.join(" ")).toMatch(/suspek outflow/);
  });

  it("lengkap ketika kedua suspek sudah ditandai", () => {
    const result = flowCompleteness({ steps: [injection, inspection], note: "" });

    expect(result.isComplete).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("satu proses boleh memikul kedua tanda sekaligus", () => {
    // Cacat yang terbentuk dan lolos pada proses yang sama memang mungkin.
    const result = flowCompleteness({
      steps: [{ name: "Assembly", suspectOccurrence: true, suspectOutflow: true }],
      note: "",
    });

    expect(result.isComplete).toBe(true);
  });

  it("tidak menuntut daftar prosesnya lengkap selain kedua tanda itu", () => {
    const result = flowCompleteness({
      steps: [{ name: "Injection", suspectOccurrence: true, suspectOutflow: true }],
      note: "",
    });

    expect(result.hasSteps).toBe(true);
    expect(result.isComplete).toBe(true);
  });
});

describe("readProcessFlow", () => {
  it("mengembalikan alur kosong untuk kolom yang belum pernah diisi", () => {
    expect(readProcessFlow(null).steps).toEqual([]);
    expect(readProcessFlow("bukan objek").steps).toEqual([]);
  });

  it("melewati langkah yang rusak, bukan membuang seluruhnya", () => {
    const value = readProcessFlow({ steps: [injection, { name: "" }, inspection] });

    expect(value.steps.map((step) => step.name)).toEqual(["Injection", "Final inspection"]);
  });
});

describe("kelengkapan section", () => {
  it("section terisi hanya ketika diagramnya sudah menunjuk kedua suspek", () => {
    const base = { key: "PROCESS_FLOW" as const, content: null };

    expect(isSectionFilled({ ...base, data: { steps: [injection, inspection] } })).toBe(true);
    expect(isSectionFilled({ ...base, data: { steps: [injection] } })).toBe(false);
    expect(isSectionFilled({ ...base, data: { steps: [] } })).toBe(false);
  });

  it("paragraf saja tidak membuat section tabel ini terisi", () => {
    // Teks lama tetap ditampilkan di layar, tetapi diagramnya belum menunjuk apa pun.
    expect(
      isSectionFilled({ key: "PROCESS_FLOW", content: "Injection lalu inspeksi.", data: null }),
    ).toBe(false);
  });

  it("hasProcessFlow sejalan dengan kelengkapannya", () => {
    expect(hasProcessFlow({ steps: [injection, inspection] })).toBe(true);
    expect(hasProcessFlow({ steps: [injection] })).toBe(false);
  });
});
