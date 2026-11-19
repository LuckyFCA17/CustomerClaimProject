import type { Metadata } from "next";
import Link from "next/link";
import { Activity, CircleCheckBig, Clock3, TriangleAlert } from "lucide-react";

import { SegmentedBar, StatRow, StatTile } from "@/components/shared/stat-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { monitoringProgress } from "@/lib/monitoring";
import { visibleClaimsWhere } from "@/lib/permissions";
import { getPortalUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Monitoring",
};

/**
 * Dasbor pemantauan CAPA.
 *
 * Klaim yang sudah ditutup ikut ditampilkan: pertanyaan yang paling sering dibawa ke
 * halaman ini bukan "apa yang sedang berjalan" melainkan "apa hasil pemantauan klaim
 * itu". Batang tipis pada tiap baris menggambarkan pembagian periodenya; angkanya
 * sudah tertulis di sebelahnya, jadi batangnya tidak memuat teks.
 */
export default async function MonitoringDashboardPage() {
  const user = await getPortalUser();
  const visible = visibleClaimsWhere(user);
  const now = new Date();

  const claims = await db.claim.findMany({
    where: {
      AND: [visible, { status: { in: ["CPAR_APPROVED", "CAPA_MONITORING", "VERIFIED_CLOSED"] } }],
    },
    orderBy: [{ closedAt: "desc" }, { updatedAt: "desc" }],
    take: 50,
    select: {
      id: true,
      claimNo: true,
      status: true,
      partName: true,
      internalPartNo: true,
      /*
       * Pemantauan berjalan per CPAR, jadi daftar ini pun per CPAR.
       *
       * Periode ikut diambil di dalam tiap CPAR, bukan sekali di tingkat klaim: klaim
       * dengan dua CPAR punya dua pemantauan yang berjalan sendiri-sendiri, dan
       * mencampurnya membuat kemajuan salah satunya terbaca sebagai kemajuan keduanya.
       */
      cpars: {
        orderBy: { issuedAt: "asc" },
        select: {
          id: true,
          cparNo: true,
          status: true,
          cycle: true,
          responsibleDept: { select: { code: true } },
          monitoring: { select: { periodNo: true, status: true, cycle: true } },
        },
      },
    },
  });

  const [sedangDipantau, siapDipantau, ditutup, periodeLewatTenggat] = await Promise.all([
    db.claim.count({ where: { AND: [visible, { status: "CAPA_MONITORING" }] } }),
    db.claim.count({ where: { AND: [visible, { status: "CPAR_APPROVED" }] } }),
    db.claim.count({ where: { AND: [visible, { status: "VERIFIED_CLOSED" }] } }),
    db.monitoringPeriod.count({
      where: {
        status: "PENDING",
        dueDate: { lt: now },
        claim: { AND: [visible, { status: "CAPA_MONITORING" }] },
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold text-nid-orange-700">Monitoring</h1>
        <p className="text-sm text-muted-foreground">
          Pemantauan efektivitas CAPA sampai klaim dinyatakan Verified Closed.
        </p>
      </header>

      <StatRow>
        <StatTile
          label="Sedang dipantau"
          value={sedangDipantau}
          hint="Periode efektivitas sedang berjalan"
          icon={Activity}
        />
        <StatTile
          label="Siap dipantau"
          value={siapDipantau}
          hint="CPAR disetujui, jadwal belum dibuka"
          icon={Clock3}
          tone={siapDipantau > 0 ? "warning" : "neutral"}
        />
        <StatTile
          label="Periode lewat tenggat"
          value={periodeLewatTenggat}
          hint="Belum dinilai melewati tanggal jatuh tempo"
          icon={TriangleAlert}
          tone={periodeLewatTenggat > 0 ? "critical" : "neutral"}
        />
        <StatTile
          label="Verified Closed"
          value={ditutup}
          hint="Klaim selesai beserta Improvement Report"
          icon={CircleCheckBig}
          tone={ditutup > 0 ? "good" : "neutral"}
        />
      </StatRow>

      <Card>
        <CardHeader>
          <CardTitle>CPAR pada tahap pemantauan</CardTitle>
          <CardDescription>
            Lima puluh terakhir, yang sudah ditutup lebih dulu. Batang menggambarkan periode
            siklus berjalan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {claims.length === 0 ? (
            <p className="rounded-lg border border-dashed border-nid-border px-3 py-8 text-center text-sm text-muted-foreground">
              Belum ada CPAR yang sampai tahap pemantauan.
            </p>
          ) : (
            <ul className="divide-y divide-nid-border">
              {claims.flatMap((claim) =>
                // Satu baris per CPAR. Klaim yang CPAR-nya dua muncul dua kali, dan itu
                // memang yang benar: keduanya pekerjaan terpisah dengan kemajuannya
                // masing-masing.
                claim.cpars.map((cpar) => {
                const cycle = cpar.cycle;
                const progress = monitoringProgress(cpar.monitoring, cycle);

                return (
                  <li key={cpar.id} className="py-3 first:pt-0">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/monitoring/${cpar.id}`}
                          className="font-medium tabular text-nid-orange-700 hover:underline"
                        >
                          {claim.claimNo}
                        </Link>
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">
                          {`${cpar.cparNo} · `}
                          {claim.partName} · {claim.internalPartNo}
                        </p>
                      </div>

                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium">
                        {cpar.responsibleDept.code}
                      </span>

                      <span className="text-xs tabular text-muted-foreground">
                        {progress.total === 0
                          ? "belum dijadwalkan"
                          : `${progress.effective}/${progress.total} efektif`}
                      </span>

                      <StatusBadge status={claim.status} />
                    </div>

                    {progress.total > 0 ? (
                      <div className="mt-2">
                        <SegmentedBar
                          segments={[
                            { count: progress.effective, tone: "good", label: "efektif" },
                            {
                              count: progress.notEffective.length,
                              tone: "critical",
                              label: "tidak efektif",
                            },
                            {
                              count: progress.pending.length,
                              tone: "warning",
                              label: "menunggu penilaian",
                            },
                          ]}
                        />
                      </div>
                    ) : null}
                  </li>
                );
                }),
              )}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
