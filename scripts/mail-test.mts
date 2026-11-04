import "dotenv/config";

import type { NotificationType } from "@/generated/prisma/enums";
import { renderClaimEmail } from "@/emails/templates";
import { NOTIFICATION_LABEL } from "@/emails/types";
import { mailFrom, sendMail, verifyMailer } from "@/lib/mailer";
import { SAMPLES } from "./lib/mail-samples.mjs";

/**
 * Mengirim satu contoh dari setiap template email ke satu alamat.
 *
 *   pnpm mail:test --to nama@gmail.com
 *   pnpm mail:test --to nama@gmail.com --only CAPA_NOT_EFFECTIVE
 *   pnpm mail:test --dry                       # render saja, tidak mengirim
 *   pnpm mail:test --list                      # daftar jenis notifikasi
 *
 * Gunanya: memeriksa ke-15 tampilan di aplikasi Gmail Android tanpa menjalankan 15 alur
 * klaim. Yang dirender di sini template yang sama persis dengan yang dipakai portal —
 * `renderClaimEmail` diimpor, bukan disalin — jadi apa yang Anda lihat di ponsel adalah
 * apa yang akan diterima pengguna.
 *
 * Yang TIDAK diuji skrip ini: siapa penerimanya dan kapan emailnya dipicu. Itu logika
 * `src/server/claim-notifications.ts` dan hanya terbukti dengan menjalankan alur klaim
 * sungguhan lalu membandingkannya dengan halaman /notifications.
 *
 * Dua tujuan yang lazim:
 *  - penangkap lokal (SMTP_HOST=127.0.0.1) → ke-15 email muncul di penampil
 *    `pnpm mail:sink`, yang dapat dibuka dari peramban ponsel;
 *  - relay sungguhan (smtp.gmail.com dkk.) → ke-15 email masuk ke kotak masuk Gmail,
 *    satu-satunya tempat rendering Gmail dapat diperiksa.
 */

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  const value = index > -1 ? process.argv[index + 1] : undefined;

  return value && !value.startsWith("--") ? value : undefined;
}

const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const TYPES = Object.keys(NOTIFICATION_LABEL) as NotificationType[];

function fail(message: string, hint?: string): never {
  console.error(`\n  ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

const isLoopback = (host: string): boolean => /^(localhost|127\.0\.0\.1|::1)$/i.test(host);

async function main(): Promise<void> {
  if (flag("list")) {
    console.log("\nJenis notifikasi:\n");
    for (const type of TYPES) console.log(`  ${type.padEnd(30)} ${NOTIFICATION_LABEL[type]}`);
    console.log("");
    return;
  }

  const only = arg("only");

  if (only && !TYPES.includes(only as NotificationType)) {
    fail(`Jenis "${only}" tidak dikenal.`, "Lihat daftarnya: pnpm mail:test --list");
  }

  const selected = only ? [only as NotificationType] : TYPES;
  const dry = flag("dry");

  // Render lebih dulu, seluruhnya, sebelum satu email pun keluar. Template yang error di
  // contoh ke-12 tidak boleh menyisakan 11 email uji di kotak masuk orang.
  console.log(`\nMerender ${selected.length} template...`);

  const rendered = [];

  for (const type of selected) {
    const email = await renderClaimEmail(type, SAMPLES[type]);
    const bytes = Buffer.byteLength(email.html, "utf8");

    rendered.push({ type, email, bytes });

    console.log(
      `  ${bytes > 102_000 ? "!" : "✓"} ${type.padEnd(30)} ${(bytes / 1024).toFixed(1).padStart(5)} KB  ${email.subject}`,
    );

    // Gmail memotong email di atas 102KB dan menyembunyikan sisanya, termasuk tombol
    // "Open in portal" yang selalu berada di bagian bawah.
    if (bytes > 102_000) {
      console.warn("    di atas 102KB — Gmail akan memotong email ini");
    }
  }

  if (dry) {
    console.log("\n--dry: tidak ada yang dikirim.\n");
    return;
  }

  const to = arg("to");

  if (!to) {
    fail(
      "Alamat tujuan belum diisi.",
      "pnpm mail:test --to nama@gmail.com   ·   render saja: pnpm mail:test --dry",
    );
  }

  const recipients = to.split(",").map((entry) => entry.trim()).filter(Boolean);
  const host = process.env.SMTP_HOST;

  if (!host) fail("SMTP_HOST belum diset di .env.", "Salin .env.example ke .env terlebih dahulu.");

  /**
   * Pagar untuk relay sungguhan.
   *
   * Satu perintah di sini mengirim 15 email. Ke penangkap lokal itu tidak berakibat apa
   * pun, tetapi lewat smtp.gmail.com ia benar-benar masuk ke kotak masuk orang — dan
   * alamat seed portal ini berakhiran @nifco.co.id, yang bisa jadi domain aktif.
   */
  if (!isLoopback(host) && !flag("yes")) {
    console.error(`\n  SMTP_HOST=${host} bukan penangkap lokal.`);
    console.error(`  ${selected.length} email akan benar-benar terkirim ke: ${recipients.join(", ")}`);
    console.error("  Ulangi dengan --yes bila itu memang yang Anda maksud.\n");
    process.exit(1);
  }

  if (!(await verifyMailer())) {
    fail(
      `SMTP di ${host}:${process.env.SMTP_PORT ?? 1025} tidak dapat dihubungi.`,
      "Penangkap lokal: pnpm mail:sink   ·   relay: periksa SMTP_USER dan SMTP_PASSWORD.",
    );
  }

  const delay = Number(arg("delay") ?? 400);

  console.log(`\nMengirim dari ${mailFrom()} lewat ${host} ke ${recipients.join(", ")}\n`);

  let sent = 0;

  for (const entry of rendered) {
    try {
      await sendMail({
        to: recipients,
        subject: entry.email.subject,
        html: entry.email.html,
        text: entry.email.text,
      });

      sent += 1;
      console.log(`  terkirim  ${entry.type}`);
    } catch (error) {
      console.error(`  GAGAL     ${entry.type}: ${error instanceof Error ? error.message : error}`);
    }

    // Jeda kecil: relay sungguhan membatasi laju, dan 15 email serentak dari satu koneksi
    // kadang ditolak sebagai lonjakan.
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  }

  console.log(`\n${sent} dari ${rendered.length} email terkirim.`);

  if (isLoopback(host)) {
    console.log("Buka penampilnya di http://localhost:1080 (atau IP LAN mesin ini dari ponsel).\n");
  } else {
    console.log("Periksa kotak masuk di ponsel: mode gelap, teks pratinjau, dan ukuran tombol.\n");
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
