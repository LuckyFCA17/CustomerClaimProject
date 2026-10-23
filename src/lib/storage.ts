import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { ValidationError } from "@/lib/errors";

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

/** Batas unggahan (asumsi A-18). */
export const UPLOAD_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  /** Sisi terpanjang foto dikompres ke ukuran ini (§7C). */
  maxImageEdge: 1600,
  imageTypes: ["image/jpeg", "image/png", "image/webp"],
  documentTypes: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
} as const;

export function isAllowedType(mimeType: string): boolean {
  return (
    (UPLOAD_LIMITS.imageTypes as readonly string[]).includes(mimeType) ||
    (UPLOAD_LIMITS.documentTypes as readonly string[]).includes(mimeType)
  );
}

export function isImage(mimeType: string): boolean {
  return (UPLOAD_LIMITS.imageTypes as readonly string[]).includes(mimeType);
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

  async moveFolder(from, to) {
    const source = resolveInsideRoot(from);
    const target = resolveInsideRoot(to);

    await mkdir(path.dirname(target), { recursive: true });
    await rename(source, target).catch((error: NodeJS.ErrnoException) => {
      // Folder belum ada berarti draft tidak punya lampiran — bukan kegagalan.
      if (error.code !== "ENOENT") throw error;
    });
  },
};

export const storage: StorageDriver = localDriver;

/** Folder sebuah klaim. Draft belum punya Claim No, jadi dipakai id-nya dulu. */
export function claimFolder(claimNo: string | null, claimId: string): string {
  // Claim No mengandung garis miring (NID/CC/26/10/0002); dijadikan tanda hubung
  // supaya tidak membuat sarang folder yang dalam.
  return claimNo ? claimNo.replace(/\//g, "-") : `_DRAFT-${claimId}`;
}

function extensionFor(mimeType: string, originalName: string): string {
  const fromName = path.extname(originalName).toLowerCase();
  if (fromName && /^\.[a-z0-9]{1,5}$/.test(fromName)) return fromName;

  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "application/pdf") return ".pdf";

  return ".bin";
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
    throw new ValidationError(
      `Ukuran berkas melebihi ${Math.round(UPLOAD_LIMITS.maxBytes / 1024 / 1024)} MB.`,
    );
  }

  if (!isAllowedType(file.type)) {
    throw new ValidationError("Tipe berkas tidak didukung. Unggah gambar, PDF, atau dokumen Office.");
  }

  const original = Buffer.from(await file.arrayBuffer());
  let data = original;
  let mimeType = file.type;
  let extension = extensionFor(file.type, file.name);

  if (isImage(file.type)) {
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
