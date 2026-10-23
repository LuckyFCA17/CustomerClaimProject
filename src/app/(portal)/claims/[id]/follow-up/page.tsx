import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { FollowUpForm } from "@/components/claim/follow-up-form";
import { StatusBadge } from "@/components/shared/status-badge";
import { db } from "@/lib/db";
import { defaultCparDueDate, toJakartaDateInput } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { getPortalUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Claim follow up",
};

/** Action Button A, jalur Follow Up (§6 Modul 2). */
export default async function FollowUpPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getPortalUser();

  const claim = await db.claim.findUnique({
    where: { id },
    select: { id: true, claimNo: true, status: true, createdById: true, partName: true, internalPartNo: true },
  });

  if (!claim) notFound();

  // Hanya klaim yang sudah terbit punya jalur ini; yang lain dikembalikan ke detail
  // alih-alih diberi formulir yang pasti ditolak server.
  if (!can(user, "claim.followUp", { status: claim.status, createdById: claim.createdById, cpar: null })) {
    redirect(`/claims/${id}`);
  }

  const [departments, documents] = await Promise.all([
    db.department.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    db.initialDocument.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold text-nid-orange-700">Claim follow up</h1>
          <StatusBadge status={claim.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          <Link href={`/claims/${claim.id}`} className="tabular hover:underline">
            {claim.claimNo}
          </Link>{" "}
          · {claim.partName} · {claim.internalPartNo}
        </p>
      </header>

      <FollowUpForm
        claimId={claim.id}
        departments={departments.map((d) => ({ id: d.id, code: d.code, name: d.name }))}
        documents={documents.map((d) => ({ id: d.id, name: d.name }))}
        defaultDueDate={toJakartaDateInput(defaultCparDueDate())}
      />
    </div>
  );
}
