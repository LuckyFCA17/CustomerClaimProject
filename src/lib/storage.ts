import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { ValidationError } from "@/lib/errors";
import {
  OFFICE_TYPE_BY_EXTENSION,
  UPLOAD_LIMITS,
  isAllowedType,
  isImage,
  isOfficeDocument,
  maxUploadLabel,
  resolveUploadType,
} from "@/lib/uploads";

/**
 * Penyimpanan berkas unggahan.
 *
 * Seluruh pemanggil hanya memakai antarmuka `StorageDriver`, sehingga penyimpanan lokal
 * dapat ditukar dengan S3/MinIO tanpa menyentuh server action. Jalur yang dikembalikan
 * selalu relatif terhadap akar penyimpanan — tidak pernah jalur absolut mesin — supaya
 * basis data tetap bermakna setelah pemindahan.
 */

export interface SavedFile {
  readonly path: string;
  readonly originalName: string;
  readonly mimeType: string;
  readonly size: number;
}

export interface StorageDriver {
  save(key: string, data: Buffer): Promise<string>;
  read(relativePath: string): Promise<Buffer>;
  remove(relativePath: string): Promise<void>;
  /** Memindahkan seluruh isi satu folder, dipakai saat draft memperoleh Claim No. */
  moveFolder(from: string, to: string): Promise<void>;
}

// Diteruskan supaya pemanggil lama tetap mengimpornya dari sini; sumbernya satu.
export { UPLOAD_LIMITS, isAllowedType, isImage, isOfficeDocument };

/**
 * sharp dimuat saat dibutuhkan, bukan saat modul diimpor.
 *
 * Binary prebuilt-nya ditautkan ke glibc, sehingga gagal dimuat di lingkungan berbasis
 * bionic seperti Termux. Kompresi foto adalah penghematan, bukan syarat — unggahan
 * tetap harus berhasil tanpanya, dengan berkas asli yang disimpan apa adanya.
 */
type SharpFactory = (typeof import("sharp"))["default"];

let sharpModule: SharpFactory | null | undefined;

async function loadSharp(): Promise<SharpFactory | null> {
  if (sharpModule !== undefined) return sharpModule;

  try {
    sharpModule = (await import("sharp")).default;
  } catch (error) {
    console.warn(
      "sharp tidak dapat dimuat; foto disimpan tanpa kompresi.",
      error instanceof Error ? error.message : error,
    );
    sharpModule = null;
  }

  return sharpModule;
}

function storageRoot(): string {
  return path.resolve(process.env.STORAGE_ROOT ?? "./storage/uploads");
}

/**
 * Menolak jalur yang keluar dari akar penyimpanan. Nama berkas berasal dari unggahan
 * pengguna, jadi `..` dan jalur absolut harus dihentikan sebelum menyentuh disk.
 */
function resolveInsideRoot(relativePath: string): string {
  const root = storageRoot();
  const resolved = path.resolve(root, relativePath);

  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new ValidationError("Jalur berkas tidak valid.");
  }

  return resolved;
}

const localDriver: StorageDriver = {
  async save(key, data) {
    const target = resolveInsideRoot(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);

    return key;
  },

  async read(relativePath) {
    return readFile(resolveInsideRoot(relativePath));
  },

  async remove(relativePath) {
    await rm(resolveInsideRoot(relativePath), { force: true });
  },

  /**
   * Memindahkan lampiran draft ke folder bernomor klaim.
   *
   * `rename` dicoba lebih dulu karena ia satu operasi dan murah. Ia gagal dengan
   * ENOTEMPTY bila folder tujuan sudah ada dan berisi — keadaan yang tidak seharusnya
   * terjadi, tetapi nyata: nomor klaim berasal dari basis data, sedangkan folder ini ada
   * di disk, dan keduanya dapat terpisah begitu basis data dipulihkan dari cadangan atau
   * dipasang ulang sementara berkas lama tertinggal.
   *
   * Dibiarkan melempar, kegagalan itu membatalkan pengiriman klaim — pengguna melihat
   * klaimnya menolak terkirim tanpa alasan yang bisa ia perbaiki, karena sebabnya ada di
   * disk server. Jadi isinya dipindahkan satu per satu ke folder yang sudah ada, bukan
   * ditimpa: berkas lama milik nomor itu tetap utuh.
   */
  async moveFolder(from, to) {
    const source = resolveInsideRoot(from);
    const target = resolveInsideRoot(to);

    await mkdir(path.dirname(target), { recursive: true });

    try {
      await rename(source, target);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;

      // Folder asal belum ada berarti draft tidak punya lampiran — bukan kegagalan.
      if (code === "ENOENT") return;
      if (code !== "ENOTEMPTY" && code !== "EEXIST") throw error;
    }

    await mkdir(target, { recursive: true });

    for (const entry of await readdir(source, { withFileTypes: true })) {
      await rename(path.join(source, entry.name), path.join(target, entry.name));
    }

    await rm(source, { recursive: true, force: true });
  },
};

export const storage: StorageDriver = localDriver;

/** Folder sebuah klaim. Draft belum punya Claim No, jadi dipakai id-nya dulu. */
export function claimFolder(claimNo: string | null, claimId: string): string {
  // Claim No mengandung garis miring (NID/CC/26/10/0002); dijadikan tanda hubung
  // supaya tidak membuat sarang folder yang dalam.
  return claimNo ? claimNo.replace(/\//g, "-") : `_DRAFT-${claimId}`;
}

const EXTENSION_BY_TYPE: Readonly<Record<string, string>> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
  ...Object.fromEntries(
    Object.entries(OFFICE_TYPE_BY_EXTENSION).map(([extension, type]) => [type, extension]),
  ),
};

function extensionFor(mimeType: string, originalName: string): string {
  const fromName = path.extname(originalName).toLowerCase();
  if (fromName && /^\.[a-z0-9]{1,5}$/.test(fromName)) return fromName;

  return EXTENSION_BY_TYPE[mimeType] ?? ".bin";
}

/**
 * Isi berkas Office benar-benar arsip ZIP, bukan sekadar bernama .docx.
 *
 * Diperiksa karena ekstensi boleh menentukan jenis berkas ketika peramban mengaku tidak
 * tahu (lihat `resolveUploadType`). Tanpa pemeriksaan ini, berkas apa pun — termasuk
 * yang dapat dieksekusi — dapat masuk hanya dengan diganti namanya menjadi `.docx`,
 * lalu tersaji kembali dari `/api/files/` dengan MIME Office yang meyakinkan.
 *
 * Yang diperiksa hanya tanda tangan arsipnya ("PK"), bukan isi XML-nya: itu cukup untuk
 * menutup celah penamaan ulang, dan membongkar arsip milik orang lain di server adalah
 * pekerjaan yang risikonya sendiri lebih besar daripada yang dicegahnya.
 */
const ZIP_SIGNATURES = ["PK\u0003\u0004", "PK\u0005\u0006", "PK\u0007\u0008"];

function looksLikeZip(data: Buffer): boolean {
  const head = data.subarray(0, 4).toString("latin1");

  return ZIP_SIGNATURES.includes(head);
}

export interface SaveUploadInput {
  readonly file: File;
  readonly folder: string;
  readonly entityType: string;
}

/**
 * Menyimpan satu unggahan. Foto dikompres lebih dulu: sisi terpanjang dipotong ke
 * 1600px (§7C) dan diubah ke JPEG progresif, sehingga lampiran kamera ponsel yang
 * berukuran belasan megabyte tidak ikut membengkakkan PDF dan lampiran email.
 */
export async function saveUpload({ file, folder, entityType }: SaveUploadInput): Promise<SavedFile> {
  if (file.size > UPLOAD_LIMITS.maxBytes) {
    throw new ValidationError(`Ukuran berkas melebihi ${maxUploadLabel()}.`);
  }

  // Jenisnya ditentukan di sini, sekali, lalu dipakai seterusnya — bukan `file.type`
  // mentah. Untuk berkas Office, peramban sering mengirim MIME yang tidak berguna.
  const resolved = resolveUploadType(file);

  if (resolved === null) {
    throw new ValidationError(
      "Tipe berkas tidak didukung. Unggah foto, PDF, atau dokumen Word/Excel/PowerPoint (.docx, .xlsx, .pptx).",
    );
  }

  const original = Buffer.from(await file.arrayBuffer());

  if (isOfficeDocument(resolved) && !looksLikeZip(original)) {
    throw new ValidationError(
      "Isi berkas tidak cocok dengan ekstensinya. Pastikan berkasnya benar-benar dokumen Office dan tidak rusak.",
    );
  }

  let data = original;
  let mimeType = resolved;
  let extension = extensionFor(resolved, file.name);

  if (isImage(resolved)) {
    const sharp = await loadSharp();

    if (sharp) {
      try {
        data = await sharp(original)
          .rotate() // hormati orientasi EXIF sebelum metadatanya dibuang
          .resize({
            width: UPLOAD_LIMITS.maxImageEdge,
            height: UPLOAD_LIMITS.maxImageEdge,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: 82, progressive: true })
          .toBuffer();

        mimeType = "image/jpeg";
        extension = ".jpg";
      } catch (error) {
        // Berkas yang berekstensi gambar tetapi isinya rusak atau bukan gambar membuat
        // sharp melempar galat libvips yang panjang. Dibiarkan naik, galat itu menjadi
        // HTTP 500 tanpa pesan di layar; pengunggah hanya melihat tidak terjadi apa-apa.
        console.warn(
          `Gambar ${file.name} tidak dapat diproses:`,
          error instanceof Error ? error.message.split("\n")[0] : error,
        );

        throw new ValidationError(
          "Berkas gambar tidak dapat dibaca. Pastikan berkasnya tidak rusak, lalu coba lagi.",
        );
      }
    }
  }

  const key = path.posix.join(folder, entityType, `${randomUUID()}${extension}`);
  const saved = await storage.save(key, data);

  return {
    path: saved,
    originalName: file.name,
    mimeType,
    size: data.byteLength,
  };
}
