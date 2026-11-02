import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { TRANSITIONS } from "@/lib/claim-state";

/**
 * Menjaga diagram state di README tetap sama dengan tabel perpindahan di kode.
 *
 * Diagram adalah dokumentasi yang paling cepat basi dan paling lama tidak ketahuan:
 * ia tetap terbaca masuk akal setelah kodenya berubah, dan justru itu yang membuatnya
 * berbahaya — pembaca memercayainya. Mengikatnya ke `TRANSITIONS` membuat perubahan
 * state machine menggagalkan unit test sampai gambarnya ikut diperbarui.
 *
 * Yang dibandingkan hanya pasangan `dari → ke`, bukan teks labelnya. Label memuat
 * penjelasan untuk manusia ("1 dari 4 menolak") yang memang tidak ada di kode, dan
 * memaksanya sama akan mengubah dokumentasi menjadi salinan kode.
 */

function readmeTransitions(): Set<string> {
  const readme = readFileSync(path.resolve("README.md"), "utf8");
  const block = /```mermaid\n(stateDiagram-v2[\s\S]*?)```/.exec(readme);

  if (!block) throw new Error("Blok mermaid stateDiagram-v2 tidak ditemukan di README.md.");

  const pairs = new Set<string>();

  for (const line of block[1].split("\n")) {
    // `A --> B: label`; panah menuju/dari [*] adalah penanda awal/akhir, bukan transisi.
    const match = /^\s*([A-Z_]+)\s*-->\s*([A-Z_]+)\s*:/.exec(line);

    if (match) pairs.add(`${match[1]}→${match[2]}`);
  }

  return pairs;
}

describe("diagram state di README", () => {
  const inCode = new Set(TRANSITIONS.map((entry) => `${entry.from}→${entry.to}`));

  it("memuat setiap perpindahan yang ada di claim-state.ts", () => {
    const inReadme = readmeTransitions();
    const missing = [...inCode].filter((pair) => !inReadme.has(pair));

    expect(missing, `belum digambar di README: ${missing.join(", ")}`).toEqual([]);
  });

  it("tidak menggambar perpindahan yang tidak ada di kode", () => {
    const inReadme = readmeTransitions();
    const extra = [...inReadme].filter((pair) => !inCode.has(pair));

    expect(extra, `digambar di README tetapi tidak ada di kode: ${extra.join(", ")}`).toEqual([]);
  });

  it("menyebut kedua status terminal sebagai akhir alur", () => {
    const readme = readFileSync(path.resolve("README.md"), "utf8");

    expect(readme).toContain("IGNORED --> [*]");
    expect(readme).toContain("VERIFIED_CLOSED --> [*]");
  });
});
