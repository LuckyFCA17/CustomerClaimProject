import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { IgnoreForm } from "@/components/claim/ignore-form";
import { StatusBadge } from "@/components/shared/status-badge";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getPortalUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Ignore claim",
};

/** Action Button A, jalur Ignore (§6 Modul 2). */
export default async function IgnorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getPortalUser();

  const claim = await db.claim.findUnique({
    where: { id },
    select: {
      id: true,
      claimNo: true,
      status: true,
      type: true,
      createdById: true,
      partName: true,
      internalPartNo: true,
    },
  });

  if (!claim) notFound();

  if (!can(user, "claim.ignore", { status: claim.status, createdById: claim.createdById, cpar: null })) {
    redirect(`/claims/${id}`);
  }

  const evidence = await db.attachment.findMany({
    where: { entityType: "ClaimIgnoration", entityId: id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold text-nid-orange-700">Ignore claim</h1>
          <StatusBadge status={claim.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          <Link href={`/claims/${claim.id}`} className="tabular hover:underline">
            {claim.claimNo}
          </Link>{" "}
          · {claim.partName} · {claim.internalPartNo}
        </p>
      </header>

      <IgnoreForm
        claimId={claim.id}
        claimType={claim.type}
        evidence={evidence.map((file) => ({
          id: file.id,
          originalName: file.originalName,
          url: `/api/files/${file.path}`,
          isImage: file.mimeType.startsWith("image/"),
        }))}
      />
    </div>
  );
}
