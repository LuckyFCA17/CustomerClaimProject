import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { can, canViewClaim, type ClaimContext } from "@/lib/permissions";
import { readSessionActor } from "@/lib/session";
import { zipStream } from "@/lib/zip";
import {
  loadPackageContents,
  packageEntries,
  packageFileName,
} from "@/server/claim-package";

export const dynamic = "force-dynamic";

/**
 * Mengunduh paket klaim sebagai satu arsip ZIP.
 *
 * POST, bukan GET: pilihan evidence dikirim sebagai daftar id, dan pada klaim berisi
 * puluhan lampiran daftar itu melewati batas panjang alamat di sebagian peramban dan
 * proxy. Dikirim sebagai form biasa, sehingga unduhannya ditangani peramban sendiri —
 * tidak ada blob yang harus disusun di JavaScript lalu dilepas lagi.
 *
 * Jawabannya dialirkan: arsip satu klaim dapat berisi puluhan foto, dan menyusunnya utuh
 * di memori lebih dulu adalah persis lonjakan yang membuat Android menghentikan Termux.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await readSessionActor();
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;

  const claim = await db.claim.findUnique({
    where: { id },
    select: {
      status: true,
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

  // Dua penjaga, dan keduanya perlu: yang pertama menolak klaim milik departemen lain,
  // yang kedua menolak tahap yang belum punya satu pun lembar untuk dipaketkan.
  if (!canViewClaim(actor, context)) return new NextResponse("Forbidden", { status: 403 });
  if (!can(actor, "claim.package", context)) return new NextResponse("Forbidden", { status: 403 });

  const form = await request.formData();
  const requested = new Set(
    form.getAll("attachment").filter((value): value is string => typeof value === "string"),
  );

  const contents = await loadPackageContents(id);

  // Pilihan disaring terhadap isi yang memang milik klaim ini. Daftarnya datang dari
  // peramban, dan id lampiran klaim lain tidak boleh ikut hanya karena disebut.
  const available = new Set(contents.groups.flatMap((group) => group.items.map((item) => item.id)));
  const attachmentIds = new Set([...requested].filter((value) => available.has(value)));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of zipStream(
          packageEntries(contents, { attachmentIds, actorName: actor.name }),
        )) {
          controller.enqueue(chunk);
        }

        controller.close();
      } catch (error) {
        // Arsip yang putus di tengah tetap terunduh sebagai berkas rusak; yang dapat
        // dilakukan di sini hanya menghentikannya dan mencatat sebabnya di log server.
        console.error("Paket klaim gagal disusun:", error);
        controller.error(error);
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${encodeURIComponent(packageFileName(contents))}"`,
      "cache-control": "no-store",
    },
  });
}
