import { existsSync } from "node:fs";
import path from "node:path";

import puppeteer, { type Browser, type Page } from "puppeteer-core";

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

export function printUrl(kind: DocumentKind, claimId: string, extra = ""): string {
  const token = createPrintToken(DOCUMENT_ROUTE[kind], claimId);

  return `${appUrl()}/print/${DOCUMENT_ROUTE[kind]}/${claimId}?token=${encodeURIComponent(token)}${extra}`;
}

/**
 * Dokumen yang wajib muat satu halaman.
 *
 * CPAR saja: lembar yang terbagi dua tidak dapat ditempel berdampingan saat review, dan
 * bagian yang paling sering dibandingkan — root cause dengan countermeasure-nya —
 * justru yang terpisah. Dokumen lain boleh sepanjang isinya.
 */
const ONE_PAGE: ReadonlySet<DocumentKind> = new Set<DocumentKind>(["CPAR"]);

/**
 * Batas bawah penyusutan.
 *
 * Di bawah ini huruf 7,5pt lembar A3 jatuh ke sekitar 5pt — muat satu halaman tetapi
 * tidak lagi terbaca dari jarak papan, yang justru alasan lembar ini dicetak A3.
 * Lebih baik dua halaman yang terbaca daripada satu halaman yang tidak.
 */
const MIN_FIT = 0.65;

/**
 * Menyusutkan isi lembar secukupnya sampai muat satu halaman.
 *
 * Tata letaknya sendiri sudah dipadatkan sampai CPAR terisi penuh muat dengan sisa
 * sekitar 8mm. Sisa setipis itu habis oleh satu action plan yang panjang atau riwayat
 * siklus yang banyak, dan ketika habis tidak ada tanda apa pun — lembarnya hanya
 * menjadi dua halaman. Fungsi ini yang menutup selisihnya.
 *
 * Dicari lewat bagi dua, bukan sekali hitung, karena dua alasan. `zoom` mengalirkan
 * ulang teks, sehingga tinggi tidak berbanding lurus dengan faktor yang dipasang — satu
 * kali hitung meleset. Dan yang dicari adalah faktor **terbesar** yang masih muat, bukan
 * yang pertama kebetulan muat: menyusut berlebihan menyisakan lembar setengah kosong
 * dengan huruf yang lebih kecil daripada seharusnya.
 *
 * Seluruhnya berjalan di dalam peramban sebagai perhitungan tata letak; tidak ada
 * pencetakan ulang, jadi biayanya kecil.
 */
async function fitToOnePage(page: Page): Promise<{ fit: number; fits: boolean }> {
  return page.evaluate(async (minFit: number) => {
    const sheet = document.querySelector<HTMLElement>(".sheet");
    if (!sheet) return { fit: 1, fits: true };

    // Tinggi satu halaman sama dengan min-height lembar, menurut konstruksinya —
    // dibaca dari sana supaya tetap benar bila ukuran kertasnya berubah.
    const pageHeight = Number.parseFloat(getComputedStyle(sheet).minHeight);
    if (!Number.isFinite(pageHeight) || pageHeight <= 0) return { fit: 1, fits: true };

    // Satu piksel kelonggaran: pembulatan tata letak tidak perlu memicu penyusutan
    // yang tidak akan terlihat siapa pun.
    const slack = 1;

    // Fungsi bantu bernama sengaja dihindari di seluruh blok ini: evaluate() mengirim
    // fungsi ini ke peramban sebagai teks, dan esbuild membungkus fungsi bernama dengan
    // helper __name yang tidak ada di sana.
    sheet.style.setProperty("--fit", "1");
    await new Promise((resolve) => requestAnimationFrame(resolve));

    if (sheet.getBoundingClientRect().height <= pageHeight + slack) {
      return { fit: 1, fits: true };
    }

    sheet.style.setProperty("--fit", String(minFit));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // Bahkan pada batas bawah keterbacaan isinya tidak muat. Lembar dibiarkan dua
    // halaman: memaksanya lebih kecil lagi menghasilkan satu halaman yang tidak
    // dapat dibaca, dan itu bukan perbaikan.
    if (sheet.getBoundingClientRect().height > pageHeight + slack) {
      return { fit: minFit, fits: false };
    }

    let fits = minFit;
    let tooBig = 1;

    // Tujuh kali bagi dua mempersempit selisihnya ke bawah 0,3% — jauh lebih halus
    // daripada yang dapat dibedakan mata pada hasil cetak.
    for (let pass = 0; pass < 7; pass += 1) {
      const middle = (fits + tooBig) / 2;

      sheet.style.setProperty("--fit", String(middle));
      await new Promise((resolve) => requestAnimationFrame(resolve));

      if (sheet.getBoundingClientRect().height <= pageHeight + slack) fits = middle;
      else tooBig = middle;
    }

    sheet.style.setProperty("--fit", String(fits));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    return { fit: fits, fits: true };
  }, MIN_FIT);
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

    if (ONE_PAGE.has(kind)) {
      const { fit, fits } = await fitToOnePage(page);
      const percent = Math.round(fit * 100);

      if (!fits) {
        console.warn(
          `${DOCUMENT_TITLE[kind]} ${claimId}: isi tetap lebih dari satu halaman walau ` +
            `disusutkan ke ${percent}%, batas bawah keterbacaan. Lembar dicetak apa adanya.`,
        );
      } else if (fit < 1) {
        console.info(
          `${DOCUMENT_TITLE[kind]} ${claimId}: isi disusutkan ke ${percent}% agar muat satu halaman.`,
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
