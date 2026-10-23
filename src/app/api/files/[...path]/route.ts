import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { canViewClaim } from "@/lib/permissions";
import { readSessionActor } from "@/lib/session";
import { storage } from "@/lib/storage";

/**
 * Menyajikan berkas unggahan.
 *
 * Berkas tidak diletakkan di folder publik: tiap permintaan diperiksa terhadap klaim
 * pemiliknya, sehingga foto klaim departemen lain tidak bisa dibuka hanya karena
 * jalurnya diketahui.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const actor = await readSessionActor();
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });

  const { path } = await params;
  const relativePath = path.join("/");

  // Dua sumber berkas: lampiran unggahan pengguna, dan PDF yang dicetak portal.
  // Keduanya dijaga aturan visibilitas klaim yang sama.
  const attachment = await db.attachment.findFirst({
    where: { path: relativePath },
    select: { mimeType: true, originalName: true, claimId: true },
  });

  const document = attachment
    ? null
    : await db.generatedDocument.findFirst({
        where: { path: relativePath },
        select: { claimId: true, kind: true, version: true },
      });

  if (!attachment && !document) return new NextResponse("Not found", { status: 404 });

  const resource = attachment ?? {
    mimeType: "application/pdf",
    originalName: relativePath.split("/").pop() ?? "dokumen.pdf",
    claimId: document?.claimId ?? null,
  };

  if (resource.claimId) {
    const claim = await db.claim.findUnique({
      where: { id: resource.claimId },
      select: {
        status: true,
        createdById: true,
        cpar: { select: { responsibleDeptId: true, cftMembers: { select: { departmentId: true } } } },
      },
    });

    if (!claim) return new NextResponse("Not found", { status: 404 });

    const allowed = canViewClaim(actor, {
      status: claim.status,
      createdById: claim.createdById,
      cpar: claim.cpar
        ? {
            responsibleDeptId: claim.cpar.responsibleDeptId,
            cftMemberDeptIds: claim.cpar.cftMembers.map((member) => member.departmentId),
          }
        : null,
    });

    if (!allowed) return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const data = await storage.read(relativePath);

    return new NextResponse(new Uint8Array(data), {
      headers: {
        "content-type": resource.mimeType,
        "content-disposition": `inline; filename="${encodeURIComponent(resource.originalName)}"`,
        // Berkas unggahan tidak pernah berubah isinya; yang berubah adalah barisnya.
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
