import type { ClaimStatus } from "@/generated/prisma/enums";
import { claimStatusFor } from "@/lib/cpar-stage";
import type { DbTransaction } from "@/lib/db";

/**
 * Status klaim sebagai turunan dari seluruh CPAR-nya.
 *
 * Sebelum satu klaim dapat memiliki beberapa CPAR, tiap peristiwa CPAR menulis langsung
 * ke `Claim.status` — sebelas tempat tersebar di empat berkas aksi. Itu bekerja selama
 * hanya ada satu CPAR, karena tahap CPAR dan status klaim memang benda yang sama.
 *
 * Dengan beberapa CPAR hal itu runtuh: CPAR A dapat sudah disetujui sementara CPAR B
 * baru diisi, dan klaim hanya punya satu kolom status. Bila tiap CPAR tetap menulis
 * sendiri, yang terakhir menyimpan yang menang — klaim akan terbaca "approved" padahal
 * ada CPAR yang belum tersentuh, dan tidak ada yang melihat keganjilannya sampai klaim
 * tertutup dengan pekerjaan yang belum selesai.
 *
 * Karena itu status klaim tidak lagi disetel siapa pun. Ia dihitung di sini, dari tahap
 * tiap CPAR, dengan satu aturan: **klaim berada pada tahap CPAR yang paling tertinggal.**
 * Klaim baru tertutup ketika seluruh CPAR-nya tertutup. Aturan itu yang dipakai orang
 * ketika ditanya "klaim ini sampai mana" — jawabannya selalu pekerjaan yang belum
 * selesai, bukan yang sudah.
 */

/**
 * Menghitung ulang status klaim dari CPAR-nya dan menyimpannya bila berubah.
 *
 * Dipanggil **setelah** perubahan pada CPAR mana pun ditulis, di dalam transaksi yang
 * sama. Mengembalikan status barunya, atau `null` bila tidak ada yang perlu diubah —
 * pemanggil memakainya untuk audit log, supaya `toStatus` yang tercatat adalah status
 * yang benar-benar tersimpan, bukan yang diperkirakan pemanggil.
 *
 * Penulisannya dilewati ketika nilainya sudah sama. Tanpa itu tiap pengisian section
 * pada CPAR kedua akan menulis ulang status klaim dengan nilai yang identik, dan
 * `updatedAt` klaim bergerak tanpa ada yang berubah padanya.
 */
export async function syncClaimStatus(
  tx: DbTransaction,
  claimId: string,
): Promise<ClaimStatus | null> {
  const [claim, cpars] = await Promise.all([
    tx.claim.findUnique({ where: { id: claimId }, select: { status: true, closedAt: true } }),
    tx.cpar.findMany({ where: { claimId }, select: { status: true, closedAt: true } }),
  ]);

  if (!claim || cpars.length === 0) return null;

  const next = claimStatusFor(cpars.map((cpar) => cpar.status));

  if (next === null || next === claim.status) return null;

  /*
   * `closedAt` klaim mengikuti CPAR yang **terakhir** tertutup.
   *
   * Bukan yang pertama: klaim belum selesai selama masih ada CPAR yang berjalan, jadi
   * waktu penutupan yang jujur adalah saat pekerjaan terakhirnya rampung. Dasbor
   * menghitung ketepatan waktu penutupan dari kolom ini, dan memakai yang pertama akan
   * membuat klaim yang molor berbulan-bulan terbaca tutup tepat waktu.
   */
  const closedAt =
    next === "VERIFIED_CLOSED"
      ? cpars.reduce<Date | null>(
          (latest, cpar) =>
            cpar.closedAt && (latest === null || cpar.closedAt > latest) ? cpar.closedAt : latest,
          null,
        )
      : null;

  await tx.claim.update({
    where: { id: claimId },
    data: { status: next, closedAt: closedAt ?? (next === "VERIFIED_CLOSED" ? new Date() : null) },
  });

  return next;
}
