import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { promisify } from "node:util";

const exec = promisify(execFile);

/**
 * Menyamakan isi folder dengan commit terakhir di remote, lalu membuang sisa build.
 *
 *   pnpm repair                 # pakai branch yang sedang aktif
 *   pnpm repair --dry-run       # tunjukkan yang akan dikerjakan, jangan kerjakan
 *
 * Ada karena satu kegagalan yang terus berulang di perangkat yang membunuh proses saat
 * memori menipis: `git pull` atau `git checkout` berhenti di tengah. Git menulis berkas
 * satu per satu, jadi yang tersisa adalah campuran — sebagian berkas versi baru, sebagian
 * tertinggal di versi lama, dan satu-dua tidak cocok dengan commit mana pun karena
 * tertulis separuh.
 *
 * Gejalanya muncul jauh dari sebabnya: `next build` berhenti dengan galat tipe tentang
 * properti yang "hilang", padahal di repositori properti itu ada dan ditambahkan pada
 * commit yang sama dengan pemakainya. Tidak ada pesan git yang muncul belakangan untuk
 * memberi tahu bahwa checkout-nya tidak utuh.
 *
 * Yang dikerjakan: fetch, reset --hard ke remote, clean berkas liar, buang .next.
 * Aman diulang — dan memang perlu diulang bila ia sendiri ikut terbunuh di tengah.
 */

const dryRun = process.argv.includes("--dry-run");

async function git(args) {
  const { stdout } = await exec("git", args, { timeout: 600_000 });

  return stdout.replace(/\s+$/, "");
}

async function step(label, args) {
  console.log(`  ${dryRun ? "akan jalan" : "jalan"}: git ${args.join(" ")}`);

  if (dryRun) return;

  await git(args);
  console.log(`      ✓ ${label}`);
}

async function main() {
  const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => null);

  if (!branch || branch === "HEAD") {
    console.error("\n  Tidak berada di branch mana pun (detached HEAD).");
    console.error("      git checkout <nama-branch> lebih dulu, lalu ulangi.\n");
    process.exitCode = 1;
    return;
  }

  console.log("Memulihkan isi folder\n");
  console.log(`  branch       : ${branch}`);
  console.log(`  sebelum      : ${await git(["log", "-1", "--format=%h %ad %s", "--date=short"])}`);

  const dirty = await git(["status", "--porcelain", "--untracked-files=no"]);
  const changed = dirty.split("\n").filter(Boolean);

  if (changed.length > 0) {
    console.log(`\n  ${changed.length} berkas akan dikembalikan ke isi commit-nya:`);
    for (const line of changed.slice(0, 10)) console.log(`      ${line.slice(3)}`);
    if (changed.length > 10) console.log(`      … dan ${changed.length - 10} lainnya`);
    console.log("\n  Suntingan lokal pada berkas di atas akan hilang.");
    console.log("  Batalkan dengan Ctrl+C bila ada yang ingin disimpan (git stash).\n");
  } else {
    console.log("\n  Tidak ada berkas yang berbeda dari commit-nya.\n");
  }

  await step("perubahan terbaru diambil", ["fetch", "origin", branch]);
  await step("isi folder disamakan dengan remote", ["reset", "--hard", "FETCH_HEAD"]);
  // Berkas liar ikut dibuang; sisa checkout yang terputus kadang berupa berkas yang tidak
  // pernah ada di commit mana pun, dan reset --hard tidak menyentuhnya.
  await step("berkas liar dibuang", ["clean", "-fd"]);

  if (!dryRun) {
    // Cache build memetakan galat ke nomor baris versi lama, sehingga pesan galat
    // sesudah pemulihan masih menunjuk ke berkas yang sudah tidak ada lagi.
    await rm(".next", { recursive: true, force: true });
    console.log("      ✓ .next dibuang");

    console.log(`\n  sesudah      : ${await git(["log", "-1", "--format=%h %ad %s", "--date=short"])}`);
  }

  console.log("\n  Berikutnya:");
  console.log("      pnpm install      # bila package.json ikut berubah");
  console.log("      pnpm typecheck    # 3 detik — hijau berarti isi folder sudah utuh");
  console.log("      pnpm boot\n");
}

void main().catch((error) => {
  console.error(`\n  Gagal: ${error instanceof Error ? error.message : String(error)}`);
  console.error("      Bila prosesnya terbunuh di tengah, jalankan pnpm repair lagi —");
  console.error("      perintahnya aman diulang.\n");
  process.exitCode = 1;
});
