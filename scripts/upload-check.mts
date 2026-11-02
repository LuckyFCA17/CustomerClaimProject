import "dotenv/config";

import { rm, statfs } from "node:fs/promises";
import path from "node:path";

import { saveUpload, storage, UPLOAD_LIMITS } from "@/lib/storage";
import { formatSizeMb, SERVER_ACTION_BODY_LIMIT_MB } from "@/lib/uploads";

/**
 * Menguji jalur simpan unggahan tanpa peramban.
 *
 *   pnpm upload:check            # foto 4 MB
 *   pnpm upload:check --mb 9     # mendekati batas 10 MB
 *
 * Gunanya memisahkan dua kemungkinan yang gejalanya sama persis di layar. Unggah foto
 * yang gagal bisa berarti servernya tidak dapat menyimpan berkas — folder tidak dapat
 * ditulis, disk penuh, sharp menolak gambarnya — atau berarti berkasnya tidak pernah
 * sampai ke server karena koneksinya terputus di tengah jalan. Keduanya muncul sebagai
 * "Unggah gagal" di portal, tetapi perbaikannya sama sekali berbeda.
 *
 * Skrip ini memanggil saveUpload() yang sama dengan yang dipakai server action, jadi
 * bila ia lulus, sisi server bukan penyebabnya dan yang perlu dicurigai adalah memori
 * atau koneksi (lihat pnpm doctor).
 */

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  const value = index > -1 ? process.argv[index + 1] : undefined;

  return value && !value.startsWith("--") ? value : undefined;
}

const ok = (message: string) => console.log(`  ✓ ${message}`);
const bad = (message: string, remedy?: string) => {
  console.log(`  ✗ ${message}`);
  if (remedy) console.log(`      → ${remedy}`);
};

/**
 * Muatan uji sebesar yang diminta, berbentuk PDF.
 *
 * Sengaja bukan gambar. Gambar dibongkar dan dikompres ulang oleh sharp, sehingga
 * ukuran yang tersimpan tidak lagi mencerminkan ukuran yang diterima — padahal justru
 * ukuran yang diterima itulah yang diuji di sini. PDF disimpan apa adanya, jadi
 * angkanya jujur. Isinya tidak pernah diurai portal, hanya ditulis ke disk.
 */
function testDocument(bytes: number): Buffer {
  const header = Buffer.from("%PDF-1.4\n% berkas uji pnpm upload:check\n", "utf8");
  const trailer = Buffer.from("\n%%EOF\n", "utf8");
  const filler = Buffer.alloc(Math.max(0, bytes - header.length - trailer.length), 0x20);

  return Buffer.concat([header, filler, trailer]);
}

/**
 * JPEG sungguhan untuk menguji jalur gambar.
 *
 * Dibuat oleh sharp bila tersedia. Tanpa sharp portal tidak mengompres apa pun, jadi
 * jalur gambarnya sama persis dengan jalur dokumen dan pengujian PDF di atas sudah
 * mewakilinya — karena itu null dikembalikan, bukan gambar tiruan.
 */
async function realPhoto(): Promise<Buffer | null> {
  try {
    const { default: sharp } = await import("sharp");

    return await sharp({
      create: { width: 4032, height: 3024, channels: 3, background: { r: 200, g: 120, b: 60 } },
    })
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch {
    return null;
  }
}

async function freeSpaceMb(target: string): Promise<number | null> {
  try {
    const info = await statfs(target);
    return Math.round((info.bsize * info.bavail) / 1024 / 1024);
  } catch {
    return null;
  }
}

/**
 * Satu percobaan simpan-baca-hapus lewat jalur yang sama dengan server action.
 *
 * Berkasnya selalu dihapus lagi: ia tidak terhubung ke klaim mana pun dan hanya akan
 * menjadi sampah yang nanti tidak ada yang berani hapus.
 */
async function attempt(label: string, file: File, expectReject = false): Promise<void> {
  console.log(`  menyimpan ${label}...`);

  let savedPath: string | null = null;

  try {
    const saved = await saveUpload({ file, folder: "_upload-check", entityType: "Diagnostic" });

    if (expectReject) {
      bad(
        `berkas ${formatSizeMb(file.size)} seharusnya ditolak, tetapi tersimpan`,
        `batas ${formatSizeMb(UPLOAD_LIMITS.maxBytes)} di lib/uploads.ts tidak berlaku — periksa saveUpload()`,
      );
      process.exitCode = 1;
    } else {
      ok(`masuk ${formatSizeMb(file.size)} → tersimpan ${formatSizeMb(saved.size)}`);
    }

    savedPath = saved.path;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Berkas di atas batas memang harus ditolak. Melaporkannya sebagai kegagalan
    // server akan mengirim orang memeriksa izin folder padahal penjaganya bekerja.
    if (expectReject) {
      ok(`ditolak sebagaimana mestinya: ${message}`);
      return;
    }

    bad(
      `gagal menyimpan: ${message}`,
      "periksa izin tulis folder di atas, sisa disk, dan nilai STORAGE_ROOT di .env",
    );
    process.exitCode = 1;
    return;
  }

  if (expectReject) return;

  try {
    const back = await storage.read(savedPath);
    ok(`dibaca kembali utuh (${formatSizeMb(back.byteLength)})`);
  } catch (error) {
    bad(`tersimpan tetapi tidak dapat dibaca kembali: ${String(error)}`);
    process.exitCode = 1;
  }

  await storage.remove(savedPath).catch(() => undefined);
}

async function main(): Promise<void> {
  const root = path.resolve(process.env.STORAGE_ROOT ?? "./storage/uploads");
  const megabytes = Number(arg("mb") ?? 4);

  console.log("Pemeriksaan jalur unggahan");
  console.log(`  folder kerja: ${process.cwd()}`);
  console.log(`  STORAGE_ROOT: ${process.env.STORAGE_ROOT ?? "(kosong, memakai ./storage/uploads)"}`);
  console.log(`  tersimpan di: ${root}`);
  console.log("");

  // Batas badan Next dan batas aplikasi berasal dari satu sumber; bila keduanya
  // berselisih, unggahan ditolak HTTP 413 sebelum kode aplikasi sempat berjalan.
  console.log(
    `  batas berkas ${formatSizeMb(UPLOAD_LIMITS.maxBytes)} · batas badan Server Action ${SERVER_ACTION_BODY_LIMIT_MB} MB`,
  );

  const free = await freeSpaceMb(process.cwd());
  if (free === null) ok("sisa disk tidak terbaca di sistem ini");
  else if (free < 200) bad(`sisa disk hanya ${free} MB`, "kosongkan ruang sebelum mengunggah foto");
  else ok(`sisa disk ${free} MB`);

  console.log("");

  const photo = await realPhoto();

  if (photo) ok("sharp termuat — foto akan dikompres ke 1600px");
  else console.log("  ! sharp tidak termuat — foto disimpan tanpa kompresi (normal di Termux)");

  console.log("");

  const bytes = Math.round(megabytes * 1024 * 1024);

  const tooBig = bytes > UPLOAD_LIMITS.maxBytes;

  await attempt(
    `dokumen ${formatSizeMb(bytes)}${tooBig ? " — di atas batas, harus ditolak" : ""}`,
    new File([new Uint8Array(testDocument(bytes))], "uji-unggah.pdf", { type: "application/pdf" }),
    tooBig,
  );

  if (photo) {
    await attempt(
      `foto 4032×3024 (${formatSizeMb(photo.byteLength)})`,
      new File([new Uint8Array(photo)], "uji-unggah.jpg", { type: "image/jpeg" }),
    );
  }

  // Folder uji ikut dibuang; berkasnya sudah dihapus, foldernya jangan ditinggalkan.
  await rm(path.join(root, "_upload-check"), { recursive: true, force: true }).catch(
    () => undefined,
  );

  console.log("");

  if (process.exitCode === 1) {
    console.log("Sisi server tidak dapat menyimpan berkas — perbaiki temuan di atas.");
    return;
  }

  console.log("Sisi server baik: berkas sebesar itu dapat disimpan dan dibaca kembali.");
  console.log(
    "Bila unggah dari peramban tetap gagal, sebabnya bukan penyimpanan — jalankan pnpm doctor",
  );
  console.log("untuk memeriksa memori, dan pastikan portal dijalankan dengan pnpm serve.");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
