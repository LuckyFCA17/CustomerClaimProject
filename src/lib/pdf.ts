import { existsSync } from "node:fs";
import path from "node:path";

import puppeteer, { type Browser } from "puppeteer-core";

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
  CPAR: "Corrective & Preventive Action Request",
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

export function printUrl(kind: DocumentKind, claimId: string, extra = ""): string {
  const token = createPrintToken(DOCUMENT_ROUTE[kind], claimId);

  return `${appUrl()}/print/${DOCUMENT_ROUTE[kind]}/${claimId}?token=${encodeURIComponent(token)}${extra}`;
}

export interface RenderPdfOptions {
  readonly kind: DocumentKind;
  readonly claimId: string;
  /** Menambahkan watermark "DRAFT" pada halaman (§6 Modul 3). */
  readonly draft?: boolean;
}

export async function renderPdf({ kind, claimId, draft = false }: RenderPdfOptions): Promise<Buffer> {
  const browser = await sharedBrowser();
  const page = await browser.newPage();

  try {
    const url = printUrl(kind, claimId, draft ? "&draft=1" : "");
    const response = await page.goto(url, { waitUntil: "networkidle0", timeout: 45_000 });

    if (!response || !response.ok()) {
      throw new Error(`Halaman cetak ${kind} menjawab ${response?.status() ?? "tanpa respons"}.`);
    }

    // Font harus selesai dimuat sebelum dicetak; kalau tidak, PDF keluar dengan
    // font pengganti dan tata letaknya bergeser.
    await page.evaluateHandle("document.fonts.ready");

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
