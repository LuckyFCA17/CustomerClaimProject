import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { db } from "@/lib/db";
import { monitoringProgress } from "@/lib/monitoring";
import { visibleClaimsWhere } from "@/lib/permissions";
import { getPortalUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Monitoring",
};

/**
 * Daftar klaim yang sudah sampai tahap pemantauan.
 *
 * Termasuk klaim yang sudah `VERIFIED_CLOSED`, karena pertanyaan yang paling sering
 * dibawa ke halaman ini bukan "apa yang sedang berjalan" melainkan "apa hasil
 * pemantauan klaim itu". Filter dan ekspor dibangun pada Fase 7.
 */
export default async function MonitoringListPage() {
  const user = await getPortalUser();

  const claims = await db.claim.findMany({
    where: {
      AND: [
        visibleClaimsWhere(user),
        { status: { in: ["CPAR_APPROVED", "CAPA_MONITORING", "VERIFIED_CLOSED"] } },
      ],
    },
    orderBy: [{ closedAt: "desc" }, { updatedAt: "desc" }],
    take: 50,
    select: {
      id: true,
      claimNo: true,
      status: true,
      partName: true,
      internalPartNo: true,
      cpar: { select: { cparNo: true, cycle: true, responsibleDept: { select: { code: true } } } },
      monitoring: { select: { periodNo: true, status: true, cycle: true } },
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold text-nid-orange-700">Monitoring</h1>
        <p className="text-sm text-muted-foreground">
          Pemantauan efektivitas CAPA sampai klaim dinyatakan Verified Closed.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{claims.length} klaim</CardTitle>
          <CardDescription>
            Klaim yang CPAR-nya sudah disetujui, sedang dipantau, atau sudah ditutup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {claims.length === 0 ? (
            <p className="rounded-lg border border-dashed border-nid-border px-3 py-8 text-center text-sm text-muted-foreground">
              Belum ada klaim yang sampai tahap pemantauan.
            </p>
          ) : (
            <ul className="divide-y divide-nid-border">
              {claims.map((claim) => {
                const cycle = claim.cpar?.cycle ?? 1;
                const progress = monitoringProgress(claim.monitoring, cycle);

                return (
                  <li
                    key={claim.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-3 first:pt-0"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/monitoring/${claim.id}`}
                        className="font-medium tabular text-nid-orange-700 hover:underline"
                      >
                        {claim.claimNo}
                      </Link>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {claim.cpar?.cparNo ? `${claim.cpar.cparNo} · ` : ""}
                        {claim.partName} · {claim.internalPartNo}
                      </p>
                    </div>

                    {claim.cpar ? (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium">
                        {claim.cpar.responsibleDept.code}
                      </span>
                    ) : null}

                    <span className="text-xs tabular text-muted-foreground">
                      {progress.total === 0
                        ? "belum dijadwalkan"
                        : `${progress.effective}/${progress.total} efektif`}
                    </span>

                    <StatusBadge status={claim.status} />
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
