/**
 * Batas unggahan (asumsi A-18), terpisah dari `lib/storage.ts`.
 *
 * `lib/storage.ts` mengimpor `node:fs`, sehingga tidak dapat dipakai komponen klien.
 * Batas yang sama harus berlaku di kedua sisi: klien memeriksanya lebih dulu supaya
 * berkas terlalu besar tidak dikirim sia-sia, dan server tetap memeriksanya sendiri
 * karena pemeriksaan di peramban bukan pengaman.
 */

export const UPLOAD_LIMITS = {
  maxBytes: 25 * 1024 * 1024,
  /** Sisi terpanjang foto dikompres ke ukuran ini (§7C). */
  maxImageEdge: 1600,
  imageTypes: ["image/jpeg", "image/png", "image/webp"],
  documentTypes: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
} as const;

/**
 * Ekstensi Office dan MIME yang seharusnya menyertainya.
 *
 * Diperlukan karena `File.type` dari peramban tidak dapat dipercaya untuk berkas Office.
 * Windows mengambilnya dari registry, Android dari penyedia dokumen, dan keduanya sering
 * mengirim `application/octet-stream` — atau kosong — untuk .docx yang sepenuhnya sah.
 * Menolak berdasarkan MIME saja berarti menolak berkas yang benar, dan pengunggahnya
 * tidak punya cara memperbaikinya.
 *
 * Hanya format XML modern. Format biner lama (.doc, .xls, .ppt) tidak diterima: ia tidak
 * dapat dibedakan dari berkas biner lain tanpa membaca struktur OLE, dan .docm/.xlsm
 * sengaja ditinggalkan karena isinya bisa memuat makro.
 */
export const OFFICE_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export const OFFICE_EXTENSIONS = Object.keys(OFFICE_TYPE_BY_EXTENSION);

/** MIME yang dikirim peramban ketika ia sebenarnya tidak tahu jenis berkasnya. */
const UNKNOWN_TYPES = ["", "application/octet-stream", "application/zip", "application/x-zip-compressed"];

/**
 * Nilai `accept` untuk input berkas.
 *
 * Memuat MIME **dan** ekstensi: pemilih berkas Windows mencocokkan ekstensi, sedangkan
 * Android mencocokkan MIME. Menulis salah satunya saja membuat berkas Office tampak
 * kelabu dan tidak dapat dipilih di salah satu dari keduanya.
 */
export const ACCEPT_IMAGES = "image/jpeg,image/png,image/webp";

export const ACCEPT_EVIDENCE = [
  ACCEPT_IMAGES,
  "application/pdf",
  ...UPLOAD_LIMITS.documentTypes.filter((type) => type !== "application/pdf"),
  ".pdf",
  ...OFFICE_EXTENSIONS,
].join(",");

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");

  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

/**
 * Jenis berkas yang sebenarnya, atau null bila tidak didukung.
 *
 * MIME dari peramban dipercaya lebih dulu bila ia memang salah satu yang diizinkan.
 * Kalau peramban mengaku tidak tahu, ekstensinya yang dipakai — dan hanya untuk format
 * Office, karena di situlah ketidaktahuan itu terjadi. Ekstensi tidak pernah dipakai
 * untuk menimpa MIME yang sudah jelas, sehingga `virus.exe` yang dinamai ulang menjadi
 * `.docx` tetap harus lolos pemeriksaan isi di server (`saveUpload`).
 */
export function resolveUploadType(file: { name: string; type: string }): string | null {
  const declared = file.type.toLowerCase();

  if (isAllowedType(declared)) return declared;

  if (UNKNOWN_TYPES.includes(declared)) {
    return OFFICE_TYPE_BY_EXTENSION[extensionOf(file.name)] ?? null;
  }

  return null;
}

/** Berkas Office tidak dapat dirender peramban; menyajikannya inline hanya menipu. */
export function isOfficeDocument(mimeType: string): boolean {
  return Object.values(OFFICE_TYPE_BY_EXTENSION).includes(mimeType);
}

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

/** Ukuran berkas untuk dibaca pengguna. Satu tempat, supaya tiap pesan menulisnya sama. */
export function formatSizeMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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
    return `Ukuran berkas ${formatSizeMb(file.size)} melebihi batas ${maxUploadLabel()}.`;
  }

  if (resolveUploadType(file) === null) {
    return "Tipe berkas tidak didukung. Unggah foto, PDF, atau dokumen Word/Excel/PowerPoint (.docx, .xlsx, .pptx).";
  }

  return null;
}
