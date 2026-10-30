import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { visibleClaimsWhere } from "@/lib/permissions";
import { getPortalUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "CPAR",
};

/**
 * Daftar CPAR yang terlihat oleh pengguna.
 *
 * Disaring dengan `visibleClaimsWhere` yang sama dengan daftar klaim, sehingga satu
 * aturan keterlihatan berlaku di kedua halaman. Filter dan ekspor dibangun pada Fase 7.
 */
export default async function CparListPage() {
  const user = await getPortalUser();

  const cpars = await db.cpar.findMany({
    where: { claim: visibleClaimsWhere(user) },
    orderBy: [{ issuedAt: "desc" }],
    take: 50,
    select: {
      id: true,
      cparNo: true,
      cycle: true,
      dueDate: true,
      submittedAt: true,
      approvedAt: true,
      responsibleDept: { select: { code: true } },
      claim: {
        select: { id: true, claimNo: true, status: true, partName: true, internalPartNo: true },
      },
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold text-nid-orange-700">CPAR</h1>
        <p className="text-sm text-muted-foreground">
          Problem Countermeasure Request yang sudah diterbitkan, terbaru lebih dulu.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{cpars.length} CPAR</CardTitle>
          <CardDescription>
            Hanya CPAR dari klaim yang boleh Anda lihat. Pengguna departemen melihat CPAR
            departemennya dan klaim yang disiarkan ke seluruh portal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cpars.length === 0 ? (
            <p className="rounded-lg border border-dashed border-nid-border px-3 py-8 text-center text-sm text-muted-foreground">
              Belum ada CPAR yang terlihat oleh Anda.
            </p>
          ) : (
            <ul className="divide-y divide-nid-border">
              {cpars.map((cpar) => {
                const overdue = cpar.dueDate < new Date() && !cpar.submittedAt;

                return (
                  <li key={cpar.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-3 first:pt-0">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/cpar/${cpar.claim.id}`}
                        className="font-medium tabular text-nid-orange-700 hover:underline"
                      >
                        {cpar.cparNo}
                      </Link>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {cpar.claim.claimNo} · {cpar.claim.partName} · {cpar.claim.internalPartNo}
                      </p>
                    </div>

                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium">
                      {cpar.responsibleDept.code}
                    </span>

                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] tabular">
                      siklus {cpar.cycle}
                    </span>

                    <span className="flex items-center gap-1 text-xs tabular text-muted-foreground">
                      <CalendarClock aria-hidden className="size-3.5" />
                      {formatDate(cpar.dueDate)}
                      {overdue ? (
                        <span className="rounded-full bg-[var(--status-danger-bg)] px-1.5 py-0.5 font-medium text-[var(--status-danger)]">
                          lewat
                        </span>
                      ) : null}
                    </span>

                    <StatusBadge status={cpar.claim.status} />
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
