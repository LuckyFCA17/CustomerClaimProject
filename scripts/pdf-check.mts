import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import "dotenv/config";

import type { DocumentKind } from "@/generated/prisma/enums";
import { DOCUMENT_TITLE, closeBrowser, renderPdf } from "@/lib/pdf";

/**
 * Mencetak kelima dokumen dan memeriksa ukuran kertasnya.
 *
 *   pnpm pdf:check --claim <claimId>
 *   pnpm pdf:check --claim <claimId> --kind CPAR
 *   pnpm pdf:check --claim <claimId> --out ./pdf     # simpan berkasnya
 *
 * Dua hal yang diperiksa, dan keduanya pernah salah tanpa memberi tanda:
 *
 *  · ukuran kertas PDF. Ia ditentukan `@page size` di CSS, bukan oleh argumen `format`
 *    Puppeteer — `preferCSSPageSize: true` membuat CSS yang menang. Jadi satu aturan CSS
 *    yang hilang mengubah CPAR dari A3 mendatar menjadi A4 tegak, dan satu-satunya
 *    gejalanya adalah lembar yang tercetak kecil;
 *  · lembar yang gagal dirender sama sekali. `generateClaimDocuments` sengaja menelan
 *    galat supaya alur klaim tidak ikut batal, sehingga PDF yang rusak hanya muncul
 *    sebagai daftar Documents yang kosong.
 *
 * Perlu Chromium dan portal yang sedang berjalan di APP_URL. Di Termux tidak ada
 * Chromium, jadi skrip ini memang hanya dapat dijalankan di mesin yang punya.
 */

/** Ukuran yang seharusnya, dalam milimeter. */
const EXPECTED: Record<DocumentKind, readonly [number, number]> = {
  BAD_NEWS: [297, 210],
  QUICK_INFO: [210, 297],
  CPAR: [420, 297],
  MONITORING: [210, 297],
  A3: [210, 297],
};

/**
 * Jumlah halaman maksimum, untuk dokumen yang memang harus muat sekian.
 *
 * CPAR harus satu halaman: lembar yang terbagi dua tidak dapat ditempel berdampingan
 * saat review, dan bagian yang paling sering dibandingkan — root cause dengan
 * countermeasure-nya — justru yang terpisah. Isinya dipadatkan untuk itu, dan ruang
 * sisanya tipis; tanpa pemeriksaan ini satu baris tambahan akan diam-diam
 * mengembalikannya menjadi dua halaman.
 */
const MAX_PAGES: Partial<Record<DocumentKind, number>> = {
  CPAR: 1,
};

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  const value = index > -1 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

function pageCount(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

/** Ukuran halaman pertama, dibaca dari /MediaBox pada berkas PDF. */
function paperSize(pdf: Buffer): readonly [number, number] | null {
  const match = /\/MediaBox\s*\[([^\]]+)\]/.exec(pdf.toString("latin1"));
  if (!match) return null;

  const points = match[1].trim().split(/\s+/).map(Number);
  if (points.length !== 4 || points.some((value) => !Number.isFinite(value))) return null;

  const toMm = (value: number) => Math.round((value / 72) * 25.4);

  return [toMm(points[2] - points[0]), toMm(points[3] - points[1])];
}

async function main(): Promise<void> {
  const claimId = arg("claim");

  if (!claimId) {
    console.error("\n  --claim <claimId> wajib diisi.\n");
    process.exitCode = 1;
    return;
  }

  const only = arg("kind") as DocumentKind | undefined;
  const outDir = arg("out");
  if (outDir) mkdirSync(outDir, { recursive: true });

  const kinds = (Object.keys(EXPECTED) as DocumentKind[]).filter((kind) => !only || kind === only);
  const failures: string[] = [];

  try {
    for (const kind of kinds) {
      try {
        const pdf = await renderPdf({ kind, claimId });
        if (outDir) writeFileSync(path.join(outDir, `${kind}.pdf`), pdf);

        const size = paperSize(pdf);
        const [wantW, wantH] = EXPECTED[kind];
        const actual = size ? `${size[0]}×${size[1]}mm` : "tidak terbaca";
        // Toleransi 1mm: konversi titik ke milimeter membulatkan.
        const ok = size !== null && Math.abs(size[0] - wantW) <= 1 && Math.abs(size[1] - wantH) <= 1;

        if (!ok) failures.push(`${kind} tercetak ${actual}, seharusnya ${wantW}×${wantH}mm`);

        const pages = pageCount(pdf);
        const maxPages = MAX_PAGES[kind];
        const pagesOk = maxPages === undefined || pages <= maxPages;

        if (!pagesOk) {
          failures.push(`${kind} tercetak ${pages} halaman, maksimal ${maxPages}`);
        }

        console.log(
          `  ${ok && pagesOk ? "✓" : "✗"} ${kind.padEnd(11)} ${actual.padEnd(12)} ` +
            `${String(pages).padStart(2)} hlm  ` +
            `${String((pdf.byteLength / 1024).toFixed(0)).padStart(4)} KB  ${DOCUMENT_TITLE[kind]}`,
        );
      } catch (error) {
        failures.push(`${kind} gagal dirender: ${error instanceof Error ? error.message : error}`);
        console.log(`  ✗ ${kind.padEnd(11)} gagal dirender`);
      }
    }
  } finally {
    await closeBrowser();
  }

  if (failures.length > 0) {
    console.error(`\n  ${failures.length} masalah:\n`);
    for (const line of failures) console.error(`    ✗ ${line}`);
    console.error("");
    process.exitCode = 1;
    return;
  }

  console.log(`\n  ${kinds.length} dokumen tercetak dengan ukuran kertas dan jumlah halaman yang benar.\n`);
}

await main();
