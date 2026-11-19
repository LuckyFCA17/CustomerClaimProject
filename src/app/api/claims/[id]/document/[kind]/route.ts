import { NextResponse } from "next/server";

import type { DocumentKind } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { DOCUMENT_TITLE, renderPdf } from "@/lib/pdf";
import { type Action, can, canViewClaim, type ClaimContext } from "@/lib/permissions";
import { readSessionActor } from "@/lib/session";
import { safeSegment } from "@/lib/zip";

export const dynamic = "force-dynamic";

/**
 * Lembar yang dapat diunduh, beserta izin yang menentukan siapa boleh.
 *
 * Izinnya sengaja izin yang **sama** dengan yang memunculkan tombol Print tiap lembar,
 * bukan aturan baru: tombol unduh muncul persis di tempat tombol cetak muncul, dan tidak
 * ada kebijakan kedua yang lambat laun bisa berbeda. A3 belum punya tombol cetak sendiri
 * dan ikut `cpar.print` — lembarnya memang turunan CPAR yang sudah disetujui.
 *
 * Kuncinya memakai ruas alamat yang sama dengan halaman cetaknya (`/print/<ruas>/<id>`),
 * sehingga dua alamat untuk lembar yang sama selalu terbaca sebagai pasangan.
 */
const DOWNLOADABLE: Record<string, { readonly kind: DocumentKind; readonly action: Action }> = {
  "bad-news": { kind: "BAD_NEWS", action: "claim.export" },
  "quick-info": { kind: "QUICK_INFO", action: "claim.export" },
  cpar: { kind: "CPAR", action: "cpar.print" },
  monitoring: { kind: "MONITORING", action: "monitoring.print" },
  a3: { kind: "A3", action: "cpar.print" },
};

/**
 * Mengunduh satu lembar sebagai PDF, dirender saat diminta.
 *
 * Dua hal yang membedakannya dari tombol Print di sebelahnya:
 *
 *   · **Dialog cetak tidak ikut campur.** Ukuran kertas, margin, dan skala ditentukan
 *     lembarnya sendiri, bukan pengaturan di dialog peramban yang dapat berbeda tiap
 *     perangkat. Itulah yang membuat CPAR A3 keluar seperti yang dirancang;
 *   · **Tidak bergantung pada `after()`.** PDF otomatis dibuat sesudah transaksi
 *     tersimpan; bila prosesnya berhenti lebih dulu, lembar itu tidak pernah ada. Yang
 *     diunduh di sini dirender saat diminta, dari data terakhir — jadi klaim lama yang
 *     PDF-nya tidak pernah terbentuk tetap dapat diambil lembarnya.
 *
 * Harganya: render ini menjalankan Chromium di mesin server. Bila Chromium tidak ada —
 * di Termux memang tidak ada — jawabannya 503 beserta sebabnya, bukan berkas rusak atau
 * galat yang tidak menyebut apa pun.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; kind: string }> },
) {
  const actor = await readSessionActor();
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });

  const { id, kind: slug } = await params;

  const document = DOWNLOADABLE[slug];
  if (!document) return new NextResponse("Not found", { status: 404 });

  const claim = await db.claim.findUnique({
    where: { id },
    select: {
      status: true,
      claimNo: true,
      createdById: true,
      cpar: {
        select: {
          responsibleDeptId: true,
          cftMembers: { select: { departmentId: true } },
          userHeadVerifierId: true,
        },
      },
    },
  });

  if (!claim) return new NextResponse("Not found", { status: 404 });

  const context: ClaimContext = {
    status: claim.status,
    createdById: claim.createdById,
    cpar: claim.cpar
      ? {
          responsibleDeptId: claim.cpar.responsibleDeptId,
          cftMemberDeptIds: claim.cpar.cftMembers.map((member) => member.departmentId),
          userHeadVerifierId: claim.cpar.userHeadVerifierId,
        }
      : null,
  };

  // Dua penjaga, keduanya perlu: yang pertama menolak klaim milik departemen lain, yang
  // kedua menolak lembar yang pada tahap ini memang belum ada isinya.
  if (!canViewClaim(actor, context)) return new NextResponse("Forbidden", { status: 403 });
  if (!can(actor, document.action, context)) return new NextResponse("Forbidden", { status: 403 });

  // Klaim yang masih draft belum punya nomor, dan lembarnya belum berarti apa-apa bagi
  // siapa pun di luar pembuatnya — sama dengan syarat yang dipakai tombol Print.
  if (claim.status === "DRAFT") return new NextResponse("Forbidden", { status: 403 });

  /*
    Watermark DRAFT tidak dipaksa dari sini.

    Halaman cetaknya yang memutuskan — CPAR yang belum disetujui seluruh verifier keluar
    berwatermark dengan sendirinya. Mengirim `draft` dari sini berarti dua tempat yang
    memutuskan hal yang sama, dan salah satunya pasti akan tertinggal.
  */
  let pdf: Buffer;

  try {
    pdf = await renderPdf({ kind: document.kind, claimId: id });
  } catch (error) {
    console.error(`Unduhan ${document.kind} ${id} gagal:`, error);

    const missingBrowser = error instanceof Error && error.message.includes("Chromium");

    return new NextResponse(
      missingBrowser
        ? "Chromium tidak tersedia di server ini, jadi PDF tidak dapat dibuat. " +
          "Pakai tombol Print di sebelahnya, atau pasang Chromium lalu isi " +
          "PUPPETEER_EXECUTABLE_PATH ke lokasinya."
        : "PDF gagal dibuat. Sebabnya tercatat di log server.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const claimNo = claim.claimNo ?? `DRAFT-${id.slice(-6).toUpperCase()}`;
  const filename = `${safeSegment(DOCUMENT_TITLE[document.kind])} - ${safeSegment(claimNo)}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "cache-control": "no-store",
    },
  });
}
