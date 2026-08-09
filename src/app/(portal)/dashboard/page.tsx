import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatusRail } from "@/components/shared/status-rail";
import { CLAIM_STATUSES, type ClaimStatus } from "@/config/claim-status";
import { ROLE_LABEL } from "@/config/navigation";
import { db } from "@/lib/db";
import { visibleClaimsWhere } from "@/lib/permissions";
import { getPortalUser } from "@/lib/session";
import { draftLabel } from "@/lib/numbering";

export const metadata: Metadata = {
  title: "Dashboard",
};

/**
 * Fase 1 — dashboard baru menampilkan klaim yang boleh dilihat pengguna, untuk
 * membuktikan cakupan RBAC bekerja dari database sampai layar. Kartu ringkas, grafik
 * klaim per bulan, pareto Non-Conformance Detail, dan tabel "Butuh tindakan saya"
 * dibangun pada Fase 7.
 */
export default async function DashboardPage() {
  const user = await getPortalUser();
  const where = visibleClaimsWhere(user);

  const [claims, totalClaims] = await Promise.all([
    db.claim.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        claimNo: true,
        status: true,
        partName: true,
        internalPartNo: true,
        createdAt: true,
        cpar: { select: { cparNo: true, cycle: true, responsibleDept: { select: { code: true } } } },
      },
    }),
    db.claim.count(),
  ]);

  const hiddenCount = totalClaims - claims.length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold text-nid-orange-700">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Masuk sebagai {user.name} — {user.roles.map((role) => ROLE_LABEL[role]).join(", ")}
          {user.departmentCode ? ` · Dept ${user.departmentCode}` : ""}.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Klaim yang terlihat oleh Anda</CardTitle>
          <CardDescription>
            Difilter lewat <code className="text-xs">visibleClaimsWhere()</code> di{" "}
            <code className="text-xs">lib/permissions.ts</code>. Pengguna departemen hanya melihat klaim yang
            departemennya ditunjuk, ditambah klaim yang sudah terbit atau ditutup.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {claims.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada klaim yang dapat Anda lihat.</p>
          ) : (
            <ul className="divide-y divide-nid-border">
              {claims.map((claim) => (
                <li key={claim.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                  <span className="font-medium tabular">{claim.claimNo ?? draftLabel(claim.id)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {claim.partName} · {claim.internalPartNo}
                    {claim.cpar
                      ? ` · ${claim.cpar.cparNo} (${claim.cpar.responsibleDept.code}, siklus ${claim.cpar.cycle})`
                      : ""}
                  </span>
                  <StatusBadge status={claim.status} showHint />
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-muted-foreground">
            {claims.length} dari {totalClaims} klaim di database
            {hiddenCount > 0 ? ` — ${hiddenCount} disembunyikan oleh aturan visibilitas.` : "."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status rail</CardTitle>
          <CardDescription>
            Elemen tanda tangan portal — dipasang di atas halaman detail klaim pada Fase 2. Tahap terlewati
            terisi oranye, tahap aktif berdenyut halus, tahap yang kembali karena revisi ditandai garis balik.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <RailSample caption="Klaim baru menunggu review QA Dept. Head" status="PENDING_QA_HEAD_REVIEW" />
          <RailSample caption="CPAR dikembalikan verifier — siklus 2" status="CPAR_REVISION" cycle={2} />
          <RailSample caption="Monitoring CAPA berjalan" status="CAPA_MONITORING" />
          <RailSample caption="Klaim selesai" status="VERIFIED_CLOSED" />
          <RailSample caption="Klaim ditutup tanpa CPAR" status="IGNORED" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status klaim</CardTitle>
          <CardDescription>
            Dua belas status pada state machine (§5). Warnanya dipakai sama persis di badge, timeline, dan grafik.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {CLAIM_STATUSES.map((status) => (
            <StatusBadge key={status} status={status} showHint />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function RailSample({
  caption,
  status,
  cycle,
}: {
  caption: string;
  status: ClaimStatus;
  cycle?: number;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-nid-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{caption}</span>
        <StatusBadge status={status} />
      </div>
      <StatusRail status={status} cycle={cycle} />
    </div>
  );
}
