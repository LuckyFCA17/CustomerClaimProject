import { existsSync } from "node:fs";
import path from "node:path";

import puppeteer, { type Browser, type Page } from "puppeteer-core";

import { FIT_ATTR, MIN_FIT, ONE_PAGE_ATTR } from "@/lib/sheet-fit";

import type { DocumentKind } from "@/generated/prisma/enums";
import { createPrintToken } from "@/lib/print-token";
import { storage } from "@/lib/storage";

/**
 * Pencetakan PDF (§9).
 *
 * Dokumen tidak disusun ulang di sini: Puppeteer membuka route /print/[doc]/[id] yang
 * merupakan halaman React A4 biasa, lalu menyimpan hasilnya. Satu sumber tata letak
 * untuk layar dan untuk kertas, sehingga pratinjau `?preview=1` memang menggambarkan
 * PDF yang akan keluar.
 */

export const DOCUMENT_ROUTE: Record<DocumentKind, string> = {
  BAD_NEWS: "bad-news",
  QUICK_INFO: "quick-info",
  CPAR: "cpar",
  MONITORING: "monitoring",
  A3: "a3",
};

export const DOCUMENT_TITLE: Record<DocumentKind, string> = {
  BAD_NEWS: "Bad News Information Form",
  QUICK_INFO: "Quick Information for Abnormal Part",
  CPAR: "Corrective & Preventive Action Report",
  MONITORING: "CAPA Implementation Monitoring",
  A3: "A3 Improvement Report",
};

/**
 * Lokasi Chromium.
 *
 * Di produksi diarahkan lewat PUPPETEER_EXECUTABLE_PATH (atau @sparticuz/chromium pada
 * lingkungan serverless). Daftar cadangan di bawah menutup mesin pengembangan yang
 * sudah memiliki Chromium terpasang, supaya tidak perlu mengunduh salinan kedua.
 */
function chromiumPath(): string {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const candidates = [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    "Chromium tidak ditemukan. Set PUPPETEER_EXECUTABLE_PATH ke berkas Chromium yang terpasang.",
  );
}

let browserPromise: Promise<Browser> | null = null;

/**
 * Satu instance peramban dipakai bersama. Menyalakan Chromium memakan waktu sekitar
 * satu detik; menyalakannya ulang untuk tiap dokumen membuat approve klaim terasa lambat.
 */
async function sharedBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      executablePath: chromiumPath(),
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
  }

  const browser = await browserPromise;

  if (!browser.connected) {
    browserPromise = null;
    return sharedBrowser();
  }

  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;

  const browser = await browserPromise;
  browserPromise = null;
  await browser.close();
}

function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/**
 * `subjectId` adalah id klaim untuk Bad News dan Quick Information, dan id **CPAR** untuk
 * lembar CPAR, monitoring, dan A3 — ketiganya menggambarkan satu CPAR, dan satu klaim
 * dapat memiliki beberapa.
 */
export function printUrl(kind: DocumentKind, subjectId: string, extra = ""): string {
  const token = createPrintToken(DOCUMENT_ROUTE[kind], subjectId);

  return `${appUrl()}/print/${DOCUMENT_ROUTE[kind]}/${subjectId}?token=${encodeURIComponent(token)}${extra}`;
}

/**
 * Menunggu halaman selesai menyesuaikan lembarnya ke satu halaman.
 *
 * Perhitungannya tidak lagi di sini. Dulu begitu, dan akibatnya CPAR yang dicetak lewat
 * tombol **Print CPAR** keluar dua halaman: tombol itu membuka dialog cetak peramban,
 * yang tidak pernah melewati fungsi ini. Satu lembar, dua jalur cetak, dua hasil —
 * dan yang dipakai sehari-hari justru jalur yang tidak disesuaikan.
 *
 * Sekarang halaman cetaklah yang menyesuaikan dirinya (`lib/sheet-fit.ts`, dipanggil
 * `AutoPrint`), dan di sini tinggal menunggu penandanya berubah dari `pending`. Lembar
 * yang tidak menandai dirinya wajib satu halaman tidak ditunggu sama sekali.
 */
async function waitForFit(page: Page): Promise<number | null> {
  const marked = await page.$(`.sheet[${ONE_PAGE_ATTR}="true"]`);
  if (!marked) return null;

  try {
    await page.waitForFunction(
      `document.querySelector('.sheet[${ONE_PAGE_ATTR}="true"]')?.getAttribute('${FIT_ATTR}') !== 'pending'`,
      { timeout: 15_000 },
    );
  } catch {
    // Skripnya tidak pernah selesai — bundel gagal dimuat, atau JS mati. Lembarnya
    // dicetak apa adanya dan mungkin dua halaman. Itu tetap lebih baik daripada
    // approve klaim yang gagal hanya karena PDF-nya tidak terbentuk: dokumen ini
    // dibuat sesudah transaksi, dan kegagalannya tidak memulangkan status.
    console.warn(
      "Lembar tidak sempat menyesuaikan diri dalam 15 detik; dicetak tanpa penyesuaian.",
    );

    return null;
  }

  return page.evaluate(
    (attr: string) =>
      Number(document.querySelector(`.sheet[data-one-page="true"]`)?.getAttribute(attr)),
    FIT_ATTR,
  );
}

export interface RenderPdfOptions {
  readonly kind: DocumentKind;
  /** Id klaim atau id CPAR — lihat `printUrl`. */
  readonly subjectId: string;
  /** Menambahkan watermark "DRAFT" pada halaman (§6 Modul 3). */
  readonly draft?: boolean;
}

export async function renderPdf({ kind, subjectId, draft = false }: RenderPdfOptions): Promise<Buffer> {
  const browser = await sharedBrowser();
  const page = await browser.newPage();

  try {
    const url = printUrl(kind, subjectId, draft ? "&draft=1" : "");
    const response = await page.goto(url, { waitUntil: "networkidle0", timeout: 45_000 });

    if (!response || !response.ok()) {
      throw new Error(`Halaman cetak ${kind} menjawab ${response?.status() ?? "tanpa respons"}.`);
    }

    // Font harus selesai dimuat sebelum dicetak; kalau tidak, PDF keluar dengan
    // font pengganti dan tata letaknya bergeser.
    await page.evaluateHandle("document.fonts.ready");

    const fit = await waitForFit(page);

    if (fit !== null && Number.isFinite(fit)) {
      const percent = Math.round(fit * 100);

      if (fit <= MIN_FIT) {
        console.warn(
          `${DOCUMENT_TITLE[kind]} ${subjectId}: isi mungkin tetap lebih dari satu halaman ` +
            `walau disusutkan ke ${percent}%, batas bawah keterbacaan.`,
        );
      } else if (percent !== 100) {
        console.info(
          `${DOCUMENT_TITLE[kind]} ${subjectId}: isi ${fit < 1 ? "disusutkan" : "dibesarkan"} ` +
            `ke ${percent}% agar memenuhi satu halaman.`,
        );
      }
    }

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
    });

    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

export interface StoredPdf {
  readonly path: string;
  readonly filename: string;
  readonly bytes: number;
}

/** Menyimpan PDF ke penyimpanan berkas dan mengembalikan jalurnya. */
export async function storePdf(
  kind: DocumentKind,
  folder: string,
  claimNo: string,
  data: Buffer,
  version: number,
): Promise<StoredPdf> {
  const safeClaimNo = claimNo.replace(/\//g, "-");
  const filename = `${safeClaimNo}_${DOCUMENT_ROUTE[kind]}_v${version}.pdf`;
  const key = path.posix.join(folder, "documents", filename);

  await storage.save(key, data);

  return { path: key, filename, bytes: data.byteLength };
}
