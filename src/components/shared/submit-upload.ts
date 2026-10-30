"use client";

import { toast } from "sonner";

import { downscaleImage } from "@/lib/image-downscale";
import { validateUploadFile } from "@/lib/uploads";

interface UploadOutcome {
  readonly ok: boolean;
  readonly message?: string;
}

/**
 * Pengiriman satu berkas unggahan dari peramban.
 *
 * Dipakai bersama oleh keempat tempat unggah agar ketiganya gagal dengan cara yang sama.
 * Dua hal yang ditangani di sini dan sebelumnya terlewat di setiap pemanggil:
 *
 *   · berkas diperiksa lebih dulu, sehingga berkas 20 MB tidak dikirim penuh hanya untuk
 *     ditolak — lambat pada koneksi ponsel, dan lonjakan memorinya dapat menjatuhkan
 *     server pada perangkat kecil;
 *   · server action yang melempar (mis. HTTP 413 dari batas badan Next) ditangkap, bukan
 *     dibiarkan menjadi penolakan promise tanpa pesan apa pun di layar.
 */
export async function submitUpload(
  file: File,
  build: (file: File) => FormData,
  send: (formData: FormData) => Promise<UploadOutcome>,
): Promise<boolean> {
  const problem = validateUploadFile(file);

  if (problem) {
    toast.error("Berkas ditolak", { description: problem });
    return false;
  }

  // Foto diperkecil lebih dulu di peramban. Yang melintas lalu tinggal ratusan
  // kilobyte, bukan beberapa megabyte — penting pada ponsel yang menjalankan
  // portalnya sendiri, tempat lonjakan memori penerimaan berkas dapat membuat
  // Android menghentikan server.
  const payload = await downscaleImage(file);

  try {
    const result = await send(build(payload));

    if (!result.ok) {
      toast.error("Unggah gagal", { description: result.message });
      return false;
    }

    return true;
  } catch (error) {
    console.error("Unggah berkas gagal:", error);

    toast.error("Unggah gagal terkirim", {
      description:
        "Server menolak atau memutus pengiriman berkas. Coba berkas yang lebih kecil, " +
        "atau periksa log server bila berulang.",
    });

    return false;
  }
}
