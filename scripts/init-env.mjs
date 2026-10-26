import { randomBytes } from "node:crypto";
import { access, copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Menyiapkan .env dari .env.example sekaligus mengisi AUTH_SECRET.
 *
 * `cp .env.example .env` saja menghasilkan AUTH_SECRET kosong, dan Auth.js menolak
 * seluruh login dengan "There was a problem with the server configuration" — keluhan
 * yang tidak menyebut variabel mana yang kurang, dan sebabnya hanya ada di log server.
 * Lebih baik nilainya dibuat di sini daripada diserahkan ke langkah manual yang mudah
 * terlewat.
 *
 *   node scripts/init-env.mjs [--force]
 *
 * Berkas .env yang sudah ada tidak ditimpa; hanya AUTH_SECRET yang masih kosong yang
 * diisi, sehingga perintah ini aman dijalankan ulang.
 */

const ENV = path.resolve(".env");
const EXAMPLE = path.resolve(".env.example");
const force = process.argv.includes("--force");

function newSecret() {
  return randomBytes(32).toString("base64");
}

async function exists(file) {
  return access(file).then(
    () => true,
    () => false,
  );
}

/** Mengembalikan nilai variabel apa adanya, termasuk tanda kutip yang mengapitnya. */
function readValue(content, key) {
  const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!match) return null;

  return match[1].trim().replace(/^["']|["']$/g, "");
}

function writeValue(content, key, value) {
  return content.replace(new RegExp(`^${key}=.*$`, "m"), `${key}="${value}"`);
}

async function main() {
  if (!(await exists(EXAMPLE))) {
    throw new Error(".env.example tidak ditemukan. Jalankan perintah ini dari akar proyek.");
  }

  if (!(await exists(ENV))) {
    await copyFile(EXAMPLE, ENV);
    console.log("  · .env dibuat dari .env.example");
  } else {
    console.log("  · .env sudah ada — isinya tidak ditimpa");
  }

  let content = await readFile(ENV, "utf8");
  const current = readValue(content, "AUTH_SECRET");

  if (current && !force) {
    console.log("  · AUTH_SECRET sudah terisi");
  } else if (current === null) {
    content += `${content.endsWith("\n") ? "" : "\n"}AUTH_SECRET="${newSecret()}"\n`;
    await writeFile(ENV, content);
    console.log("  · AUTH_SECRET ditambahkan");
  } else {
    await writeFile(ENV, writeValue(content, "AUTH_SECRET", newSecret()));
    console.log(force ? "  · AUTH_SECRET diganti dengan nilai baru" : "  · AUTH_SECRET diisi");
  }

  console.log("Selesai. Periksa DATABASE_URL di .env sebelum menjalankan pnpm db:migrate.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
