import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Menjalankan pengingat terjadwal lewat portal yang sedang hidup.
 *
 *   pnpm reminders [--url http://127.0.0.1:3000]
 *
 * Hanya sebuah panggilan HTTP: logikanya ada di src/app/api/reminders/route.ts, supaya
 * yang dijalankan cron sama persis dengan yang dijalankan tangan. Aman diulang —
 * pengingat yang sudah terkirim hari ini tidak akan terkirim lagi.
 */

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
}

/** .env dibaca sendiri; skrip ini sengaja tidak bergantung pada Next maupun dotenv. */
function readEnv(key) {
  if (process.env[key]) return process.env[key];

  try {
    const text = readFileSync(path.resolve(process.cwd(), ".env"), "utf8");
    const line = text
      .split("\n")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${key}=`));

    if (!line) return undefined;

    return line.slice(key.length + 1).replace(/^["']|["']$/g, "").trim() || undefined;
  } catch {
    return undefined;
  }
}

const base = (arg("url", readEnv("APP_URL") ?? "http://127.0.0.1:3000")).replace(/\/$/, "");
const token = readEnv("REMINDER_TOKEN");

if (!token) {
  console.error("REMINDER_TOKEN belum diisi di .env.");
  console.error("  Buat nilai acak:  openssl rand -hex 24");
  process.exit(1);
}

let response;

try {
  response = await fetch(`${base}/api/reminders`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
} catch (error) {
  console.error(`Portal di ${base} tidak dapat dihubungi — apakah sudah dijalankan?`);
  console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const body = await response.json().catch(() => null);

if (!response.ok) {
  console.error(`Gagal (HTTP ${response.status}): ${body?.error ?? "tidak ada keterangan"}`);
  process.exit(1);
}

// HTTP 200 belum tentu berarti pengingat berjalan: panggilan yang dibelokkan ke
// halaman login juga membalas 200. Yang menentukan adalah bentuk jawabannya.
if (!body?.ok || !body.queued) {
  console.error(`Jawaban tidak dikenali dari ${base}/api/reminders.`);
  console.error("  Pastikan portal yang berjalan sudah memuat versi terbaru.");
  process.exit(1);
}

const { cparDaily, cparReview, monitoringWeekly } = body.queued;

console.log("Pengingat dijalankan:");
console.log(`  · CPAR lewat tenggat        ${cparDaily ?? 0}`);
console.log(`  · CPAR menunggu keputusan   ${cparReview ?? 0}`);
console.log(`  · Periode jatuh tempo besok ${monitoringWeekly ?? 0}`);
console.log("Email yang sudah terkirim hari ini tidak dikirim ulang.");
