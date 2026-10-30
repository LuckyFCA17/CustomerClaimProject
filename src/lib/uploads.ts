/**
 * Batas unggahan (asumsi A-18), terpisah dari `lib/storage.ts`.
 *
 * `lib/storage.ts` mengimpor `node:fs`, sehingga tidak dapat dipakai komponen klien.
 * Batas yang sama harus berlaku di kedua sisi: klien memeriksanya lebih dulu supaya
 * berkas terlalu besar tidak dikirim sia-sia, dan server tetap memeriksanya sendiri
 * karena pemeriksaan di peramban bukan pengaman.
 */

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

/**
 * Batas badan Server Action yang harus diset di next.config.ts.
 *
 * Next.js membatasi badan Server Action di 1 MB secara bawaan dan menolaknya dengan
 * HTTP 413 sebelum kode aplikasi berjalan — foto kamera ponsel yang 3 MB tidak akan
 * pernah sampai ke `saveUpload`. Nilainya diberi kelonggaran di atas `maxBytes` untuk
 * menampung batas multipart dan medan lain pada FormData.
 */
export const SERVER_ACTION_BODY_LIMIT_MB = Math.ceil(UPLOAD_LIMITS.maxBytes / 1024 / 1024) + 2;

export function isAllowedType(mimeType: string): boolean {
  return (
    (UPLOAD_LIMITS.imageTypes as readonly string[]).includes(mimeType) ||
    (UPLOAD_LIMITS.documentTypes as readonly string[]).includes(mimeType)
  );
}

export function isImage(mimeType: string): boolean {
  return (UPLOAD_LIMITS.imageTypes as readonly string[]).includes(mimeType);
}

export function maxUploadLabel(): string {
  return `${Math.round(UPLOAD_LIMITS.maxBytes / 1024 / 1024)} MB`;
}

/**
 * Pemeriksaan yang dijalankan peramban sebelum berkas dikirim.
 *
 * Mengembalikan pesan galat, atau null bila berkasnya boleh dikirim. Tanpa ini, berkas
 * 20 MB tetap diunggah penuh hanya untuk ditolak di server — lambat pada koneksi ponsel,
 * dan pada perangkat kecil lonjakan memorinya dapat menjatuhkan server itu sendiri.
 */
export function validateUploadFile(file: { size: number; type: string; name: string }): string | null {
  if (file.size === 0) {
    return "Berkas kosong.";
  }

  if (file.size > UPLOAD_LIMITS.maxBytes) {
    const actual = (file.size / 1024 / 1024).toFixed(1);
    return `Ukuran berkas ${actual} MB melebihi batas ${maxUploadLabel()}.`;
  }

  if (!isAllowedType(file.type)) {
    return "Tipe berkas tidak didukung. Unggah gambar, PDF, atau dokumen Office.";
  }

  return null;
}
