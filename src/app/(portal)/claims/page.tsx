import type { Metadata } from "next";
import Link from "next/link";
import { FilePlus2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { db } from "@/lib/db";
import { draftLabel } from "@/lib/numbering";
import { can, visibleClaimsWhere } from "@/lib/permissions";
import { getPortalUser } from "@/lib/session";
import { formatDate } from "@/lib/format";
import { createClaimDraft } from "@/server/actions/claim";

export const metadata: Metadata = {
  title: "Claims",
};

/**
 * Daftar klaim. Fase 2 menampilkan seluruh klaim yang boleh dilihat pengguna, diurutkan
 * dari yang terbaru. Tabel server-side dengan filter status, tipe, departemen, part no.,
 * rentang tanggal, dan ekspor Excel dibangun pada Fase 7.
 */
export default async function ClaimsPage() {
  const user = await getPortalUser();

  const claims = await db.claim.findMany({
    where: visibleClaimsWhere(user),
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
    take: 50,
    select: {
      id: true,
      claimNo: true,
      status: true,
      type: true,
      partName: true,
      internalPartNo: true,
      dateOfOccurrence: true,
      createdAt: true,
      createdBy: { select: { name: true } },
      cpar: { select: { cparNo: true, cycle: true, responsibleDept: { select: { code: true } } } },
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold text-nid-orange-700">Claims</h1>
          <p className="text-sm text-muted-foreground">
            Register klaim pelanggan. Menggantikan log Excel yang lama.
          </p>
        </div>

        {can(user, "claim.create") ? (
          <form action={createClaimDraft}>
            <Button type="submit" size="lg">
              <FilePlus2 aria-hidden />
              Issue new claim
            </Button>
          </form>
        ) : null}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{claims.length} klaim</CardTitle>
          <CardDescription>
            Hanya klaim yang menjadi tanggung jawab Anda, ditambah klaim yang sudah terbit.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {claims.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">
              Belum ada klaim yang dapat Anda lihat.
            </p>
          ) : (
            <ul className="divide-y divide-nid-border">
              {claims.map((claim) => (
                <li key={claim.id}>
                  <Link
                    href={`/claims/${claim.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-secondary"
                  >
                    <span className="w-full font-medium tabular sm:w-44">
                      {claim.claimNo ?? draftLabel(claim.id)}
                    </span>

                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block truncate">{claim.partName || "Part belum diisi"}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {claim.internalPartNo || "—"}
                        {claim.cpar ? ` · ${claim.cpar.cparNo} (${claim.cpar.responsibleDept.code})` : ""}
                        {" · "}
                        {claim.dateOfOccurrence
                          ? `Terjadi ${formatDate(claim.dateOfOccurrence)}`
                          : `Dibuat ${formatDate(claim.createdAt)}`}
                        {" · "}
                        {claim.createdBy.name}
                      </span>
                    </span>

                    <StatusBadge status={claim.status} showHint />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
