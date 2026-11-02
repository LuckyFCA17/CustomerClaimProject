import { z } from "zod";

import { RoleCode } from "@/generated/prisma/enums";

/**
 * Data acuan (§6 master data).
 *
 * Yang diubah di sini dipakai di seluruh portal: departemen menentukan siapa boleh
 * melihat klaim mana, dan role menentukan siapa boleh memutuskan apa. Karena itu
 * validasinya lebih ketat daripada form biasa — bukan demi kerapian, melainkan karena
 * satu kolom yang salah di sini mengubah hak akses puluhan orang sekaligus.
 */

const trimmed = (max: number) => z.string().trim().max(max, `Maksimal ${max} karakter.`);

/**
 * Email dibersihkan sebelum diperiksa bentuknya.
 *
 * `z.email()` memeriksa nilai apa adanya, jadi alamat yang disalin-tempel bersama
 * spasi di ujungnya — hal yang lumrah terjadi — ditolak sebagai "tidak valid" padahal
 * alamatnya benar. Menormalkannya lebih dulu membuat pesan galat hanya muncul untuk
 * alamat yang memang salah.
 */
const emailField = (message: string) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
    z.email(message),
  );

/**
 * Kode departemen dinormalkan menjadi huruf besar.
 *
 * Kode dipakai apa adanya pada tampilan sempit — lencana CPAR, kolom lembar cetak — dan
 * "prd" di sebelah "ENG" terbaca seperti data yang kotor. Menormalkannya saat disimpan
 * lebih baik daripada menuntut orang mengetik dengan benar.
 */
export const departmentSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Kode minimal 2 karakter.")
    .max(10, "Kode maksimal 10 karakter.")
    .regex(/^[A-Za-z0-9&-]+$/, "Kode hanya boleh huruf, angka, & dan -.")
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2, "Nama departemen wajib diisi.").max(80, "Maksimal 80 karakter."),
  /** Alamat grup departemen; dipakai sebagian notifikasi selain alamat per orang. */
  email: z
    .union([z.literal(""), emailField("Alamat email tidak valid.")])
    .optional()
    .transform((value) => value ?? ""),
  isActive: z.coerce.boolean().default(true),
});

export type DepartmentInput = z.infer<typeof departmentSchema>;

export const PASSWORD_MIN = 10;

/**
 * Kata sandi awal dan penggantinya.
 *
 * Sepuluh karakter, bukan delapan: portal ini dibuka dari ponsel di lantai produksi
 * lewat jaringan pabrik, dan satu-satunya penjaga di depannya adalah kata sandi ini.
 */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Kata sandi minimal ${PASSWORD_MIN} karakter.`)
  .max(200, "Kata sandi terlalu panjang.");

export const ROLE_CODES = Object.values(RoleCode);

const userBase = z.object({
  name: z.string().trim().min(2, "Nama wajib diisi.").max(80, "Maksimal 80 karakter."),
  email: emailField("Alamat email tidak valid."),
  /** Dicetak pada blok tanda tangan PDF, jadi diperlakukan sebagai data wajib. */
  jobTitle: z.string().trim().min(2, "Jabatan wajib diisi.").max(80, "Maksimal 80 karakter."),
  employeeNo: trimmed(30).optional().or(z.literal("")),
  /** Boleh kosong: direksi dan manajer pabrik tidak bernaung di satu departemen. */
  departmentId: trimmed(40).optional().or(z.literal("")),
  roles: z
    .array(z.enum(RoleCode, { message: "Role tidak dikenal." }))
    .min(1, "Pilih setidaknya satu role.")
    .max(ROLE_CODES.length, "Role terlalu banyak."),
  isActive: z.coerce.boolean().default(true),
});

export const createUserSchema = userBase.extend({ password: passwordSchema });

export type CreateUserInput = z.infer<typeof createUserSchema>;

/** Penyuntingan tidak menyertakan kata sandi; penggantiannya lewat jalur sendiri. */
export const updateUserSchema = userBase.extend({ id: z.string().trim().min(1) });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({
  id: z.string().trim().min(1),
  password: passwordSchema,
});

/**
 * Role yang membuka pintu ke data acuan.
 *
 * Dipisah menjadi tetapan supaya aturan "harus selalu ada satu Administrator aktif"
 * tidak ditulis ulang di beberapa tempat dengan kata yang berbeda.
 */
export const ADMIN_ROLE: RoleCode = RoleCode.ADMIN;

export function hasAdminRole(roles: readonly RoleCode[]): boolean {
  return roles.includes(ADMIN_ROLE);
}

/**
 * Apakah perubahan ini membuang Administrator aktif yang terakhir.
 *
 * Portal tanpa Administrator aktif tidak dapat diperbaiki dari dalam: tidak ada yang
 * boleh membuka halaman data acuan untuk mengangkat Administrator baru, dan satu-satunya
 * jalan keluar adalah menyunting basis data langsung. Pemeriksaannya murni perhitungan
 * agar dapat diuji tanpa basis data.
 */
export function wouldRemoveLastAdmin(input: {
  /** Jumlah Administrator aktif saat ini, termasuk pengguna yang sedang disunting. */
  readonly activeAdmins: number;
  readonly wasActiveAdmin: boolean;
  readonly willBeActiveAdmin: boolean;
}): boolean {
  if (!input.wasActiveAdmin || input.willBeActiveAdmin) return false;

  return input.activeAdmins <= 1;
}
