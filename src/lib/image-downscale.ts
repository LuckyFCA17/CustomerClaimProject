"use client";

import { UPLOAD_LIMITS, isImage } from "@/lib/uploads";

/**
 * Memperkecil foto di peramban sebelum diunggah.
 *
 * Foto kamera ponsel berukuran 3–10 MB, padahal server memperkecilnya ke 1600px dan
 * menyimpannya di bawah 1 MB. Mengirim versi penuh berarti seluruh berkas itu ditahan
 * utuh di memori server saat diterima, lalu disalin lagi saat didekode untuk dikompres.
 * Pada ponsel yang menjalankan portalnya sendiri lewat Termux, lonjakan itulah yang
 * membuat Android menghentikan prosesnya — unggahan foto terasa "mematikan server".
 *
 * Memperkecilnya di sisi pengirim menghapus lonjakan itu: ponsel sudah memegang fotonya
 * dan punya pemecah kode gambar bawaan, sehingga yang melintas tinggal ratusan kilobyte.
 *
 * Server tetap memperkecil dan memeriksa ulang. Pemeriksaan di peramban bukan pengaman,
 * dan peramban lama yang tidak mendukung `createImageBitmap` tetap harus bisa mengunggah
 * — karena itu setiap kegagalan di sini mengembalikan berkas aslinya, bukan galat.
 */

/** Di bawah ukuran ini, memperkecil tidak sepadan dengan waktunya. */
const SKIP_BELOW_BYTES = 512 * 1024;

/**
 * Apa yang terjadi pada berkasnya.
 *
 * Dikembalikan bersama berkasnya, bukan hanya berkasnya, karena pemanggil perlu
 * membedakan "tidak perlu diperkecil" dari "tidak bisa diperkecil". Keduanya
 * menghasilkan berkas asli, tetapi hanya yang kedua layak diberitahukan kepada
 * pengunggah: fotonya melintas utuh, dan unggahannya lebih mudah terputus.
 */
export type DownscaleOutcome =
  | "downscaled"
  | "not-needed"
  /** Peramban tidak menyediakan createImageBitmap atau OffscreenCanvas. */
  | "unsupported"
  /** Percobaan gagal — foto rusak, kehabisan memori, atau kanvas ditolak. */
  | "failed";

export interface DownscaleResult {
  readonly file: File;
  readonly outcome: DownscaleOutcome;
}

export async function downscaleImage(file: File): Promise<DownscaleResult> {
  if (!isImage(file.type) || file.size <= SKIP_BELOW_BYTES) {
    return { file, outcome: "not-needed" };
  }

  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") {
    return { file, outcome: "unsupported" };
  }

  try {
    // `from-image` menerapkan orientasi EXIF saat dekode, sehingga foto potret tidak
    // tersimpan terbaring — metadata EXIF-nya hilang begitu digambar ke kanvas.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const longest = Math.max(bitmap.width, bitmap.height);

    if (longest <= UPLOAD_LIMITS.maxImageEdge) {
      bitmap.close();
      return { file, outcome: "not-needed" };
    }

    const scale = UPLOAD_LIMITS.maxImageEdge / longest;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");

    if (!context) {
      bitmap.close();
      return { file, outcome: "failed" };
    }

    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.82 });

    // Hasil yang justru lebih besar dari aslinya tidak ada gunanya dikirim.
    if (blob.size >= file.size) return { file, outcome: "not-needed" };

    return {
      file: new File([blob], replaceExtension(file.name), {
        type: "image/jpeg",
        lastModified: file.lastModified,
      }),
      outcome: "downscaled",
    };
  } catch (error) {
    console.warn("Foto tidak dapat diperkecil di peramban; mengirim berkas asli.", error);
    return { file, outcome: "failed" };
  }
}

function replaceExtension(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, "");

  return `${base || "foto"}.jpg`;
}
