import { readdir, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Membandingkan umur hasil build dengan umur kodenya.
 *
 * Dipakai bersama oleh `pnpm checkup` (melaporkannya) dan `pnpm boot` (bertindak atasnya),
 * supaya keduanya tidak pernah berselisih tentang apa artinya "build sudah basi".
 *
 * Ini yang membuat `pnpm start` aman dipakai sehari-hari: `next start` menyajikan isi
 * `.next` apa adanya, jadi setelah `git pull` route yang baru belum ada di dalamnya sampai
 * build dijalankan lagi — dan gejalanya adalah halaman 404 pada menu yang kodenya
 * jelas-jelas sudah ada. Tidak ada yang memberi tahu; build basi melayani permintaan
 * seolah semuanya normal.
 */

/** Berkas yang perubahannya mengharuskan build ulang. */
const SOURCE_ROOTS = ["src", "prisma/schema.prisma", "next.config.ts", "package.json"];

export async function newestSourceMtime() {
  let newest = 0;

  async function walk(target) {
    const info = await stat(target).catch(() => null);
    if (!info) return;

    if (info.isDirectory()) {
      const entries = await readdir(target, { withFileTypes: true });

      for (const entry of entries) {
        // src/generated diisi ulang `prisma generate` setiap pnpm install, jadi waktunya
        // tidak mencerminkan perubahan kode yang perlu di-build ulang.
        if (entry.name === "generated") continue;

        await walk(path.join(target, entry.name));
      }

      return;
    }

    newest = Math.max(newest, info.mtimeMs);
  }

  for (const root of SOURCE_ROOTS) await walk(path.resolve(root));

  return newest;
}

/**
 * Keadaan hasil build: `"missing"`, `"stale"`, atau `"fresh"`.
 *
 * `minutesBehind` hanya terisi pada `"stale"`, untuk ditampilkan apa adanya kepada
 * pembaca — selisih waktu lebih mudah dipercaya daripada vonis tanpa angka.
 */
export async function buildState() {
  const buildId = await stat(path.resolve(".next/BUILD_ID")).catch(() => null);

  if (!buildId) return { state: "missing", minutesBehind: 0 };

  const newest = await newestSourceMtime();

  if (newest > buildId.mtimeMs) {
    return { state: "stale", minutesBehind: Math.round((newest - buildId.mtimeMs) / 60000) };
  }

  return { state: "fresh", minutesBehind: 0 };
}
