import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatusRail } from "@/components/shared/status-rail";
import { CLAIM_STATUSES } from "@/config/claim-status";

export const metadata: Metadata = {
  title: "Dashboard",
};

/**
 * Fase 0 — halaman ini masih pratinjau bahasa desain, bukan dashboard sungguhan.
 * Kartu ringkas, grafik klaim per bulan, pareto Non-Conformance Detail, dan tabel
 * "Butuh tindakan saya" dibangun pada Fase 7 di atas data asli.
 */
export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold text-nid-orange-700">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Kerangka portal sudah berdiri. Data, alur status, dan notifikasi menyusul per fase.
        </p>
      </header>

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

      <Card>
        <CardHeader>
          <CardTitle>Fase berikutnya</CardTitle>
          <CardDescription>Urutan pengerjaan sesuai PLAN.md §7.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {[
            ["Fase 1", "Prisma schema, migrasi, seed, Auth.js + RBAC"],
            ["Fase 2", "State machine + unit test, form klaim & review QA Head"],
            ["Fase 3", "PDF Bad News & Quick Info, mailer, template email"],
          ].map(([phase, detail]) => (
            <div key={phase} className="flex items-start gap-3">
              <Badge variant="count" className="mt-0.5 shrink-0">
                {phase}
              </Badge>
              <span className="text-muted-foreground">{detail}</span>
            </div>
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
  status: (typeof CLAIM_STATUSES)[number];
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
