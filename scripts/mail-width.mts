import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { chromium } from "@playwright/test";

import type { NotificationType } from "@/generated/prisma/enums";
import { renderClaimEmail } from "@/emails/templates";
import { NOTIFICATION_LABEL } from "@/emails/types";
import { SAMPLES } from "./lib/mail-samples.mjs";

/**
 * Mengukur lebar setiap template email pada lebar layar ponsel.
 *
 *   pnpm mail:width
 *   pnpm mail:width --only CPAR_REQUEST
 *   pnpm mail:width --shots .mail-shots     # simpan tangkapan layar 360px
 *
 * Ada karena cacat yang pernah lolos ke produksi tidak terlihat sebagai galat apa pun.
 * Kartu email dulu memakai `width="600"` dengan `max-width:100%`, dan `max-width` itu
 * tidak pernah bekerja: sel induknya ikut melebar mengikuti isinya, sehingga 100% selalu
 * berarti 600px. Di layar 360px email menjadi 624px — klien ponsel lalu memperkecil
 * seluruh email agar muat, dan yang terbaca pengguna adalah huruf yang mengecil, bukan
 * pesan galat. Satu-satunya cara menemukannya adalah mengukur.
 *
 * Yang diperiksa: tidak ada yang meluap pada 320/360/414px, kartu tetap dibatasi 600px
 * pada layar lebar, dan tombol aksi tidak lebih pendek dari 44px.
 *
 * Yang TIDAK diperiksa: rendering Gmail. Gmail membuang sebagian CSS dan memaksa mode
 * gelap; untuk itu tetap perlu `pnpm mail:test --to <alamat Gmail>`.
 */

const WIDTHS = [320, 360, 414] as const;
const DESKTOP = 800;
const CARD_MAX = 600;
const TAP_MIN = 44;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  const value = index > -1 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

async function main(): Promise<void> {
  const only = arg("only") as NotificationType | undefined;
  const shots = arg("shots");

  const types = (Object.keys(SAMPLES) as NotificationType[]).filter(
    (type) => !only || type === only,
  );

  if (types.length === 0) {
    console.error(`\n  Jenis notifikasi "${only}" tidak dikenal.\n`);
    process.exitCode = 1;
    return;
  }

  const work = mkdtempSync(path.join(tmpdir(), "ncc-mail-width-"));
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium",
    args: ["--no-sandbox", "--no-proxy-server"],
  });

  const failures: string[] = [];

  try {
    for (const type of types) {
      const { html } = await renderClaimEmail(type, SAMPLES[type]);
      const file = path.join(work, `${type}.html`);
      writeFileSync(file, html, "utf8");

      const notes: string[] = [];

      for (const width of [...WIDTHS, DESKTOP]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        await page.goto(`file://${file}`, { waitUntil: "load" });

        const measured = await page.evaluate(() => {
          const card = document.querySelector<HTMLElement>("div[style*='max-width']");
          const button = document.querySelector<HTMLElement>("a[href]");

          return {
            scroll: document.documentElement.scrollWidth,
            card: card ? Math.round(card.getBoundingClientRect().width) : -1,
            tap: button ? Math.round(button.getBoundingClientRect().height) : -1,
          };
        });

        if (measured.scroll > width) {
          failures.push(`${type} @${width}px meluap ${measured.scroll - width}px`);
          notes.push(`${width}:meluap+${measured.scroll - width}`);
        } else {
          notes.push(`${width}:ok`);
        }

        if (width === DESKTOP && measured.card > CARD_MAX) {
          failures.push(`${type} melebar ${measured.card}px di layar lebar (batas ${CARD_MAX}px)`);
        }

        if (measured.tap >= 0 && measured.tap < TAP_MIN) {
          failures.push(`${type} @${width}px tombol hanya ${measured.tap}px (minimal ${TAP_MIN}px)`);
        }

        if (width === 360 && shots) {
          await page.screenshot({ path: path.join(shots, `${type}.png`), fullPage: true });
        }

        await page.close();
      }

      // Ghost table hanya terlihat Outlook; keberadaannya diperiksa di sini karena ia
      // dipasang pada HTML jadi, sesudah React selesai merender.
      const ghost = html.includes("<!--[if mso]>");
      if (!ghost) failures.push(`${type} kehilangan ghost table Outlook`);

      console.log(
        `  ${ghost ? "✓" : "✗"} ${type.padEnd(28)} ${NOTIFICATION_LABEL[type].padEnd(34)} ${notes.join(" ")}`,
      );
    }
  } finally {
    await browser.close();
    rmSync(work, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    console.error(`\n  ${failures.length} masalah lebar:\n`);
    for (const line of failures) console.error(`    ✗ ${line}`);
    console.error("");
    process.exitCode = 1;
    return;
  }

  console.log(`\n  ${types.length} template muat di 320/360/414px, dibatasi ${CARD_MAX}px di desktop.\n`);
}

await main();
