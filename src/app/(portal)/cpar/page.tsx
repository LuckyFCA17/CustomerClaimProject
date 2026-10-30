import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, CircleCheckBig, ClipboardList, Clock3, TriangleAlert } from "lucide-react";

import { StatRow, StatTile } from "@/components/shared/stat-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { visibleClaimsWhere } from "@/lib/permissions";
import { getPortalUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "CPAR",
};

/**
 * Dasbor CPAR.
 *
 * Empat angka utama lalu daftarnya. Bukan diagram: beberapa angka kepala terbaca
 * lebih cepat sebagai deretan kartu daripada sebagai batang yang panjangnya harus
 * dibandingkan satu sama lain.
 *
 * Seluruhnya disaring `visibleClaimsWhere` yang sama dengan daftar klaim, sehingga
 * satu aturan keterlihatan berlaku di semua halaman.
 */
export default async function CparDashboardPage() {
  const user = await getPortalUser();
  const visible = visibleClaimsWhere(user);
  const now = new Date();

  const cpars = await db.cpar.findMany({
    where: { claim: visible },
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
      _count: { select: { verifications: true } },
    },
  });

  // Hitungan diambil dari basis data, bukan dari 50 baris yang ditampilkan — kartu
  // yang menghitung isi halaman pertama saja akan berbohong begitu datanya bertambah.
  const [sedangDiisi, menungguVerifikasi, disetujui, lewatTenggat] = await Promise.all([
    db.cpar.count({
      where: { claim: { AND: [visible, { status: { in: ["CPAR_ISSUED", "CPAR_IN_PROGRESS"] } }] } },
    }),
    db.cpar.count({ where: { claim: { AND: [visible, { status: "CPAR_UNDER_VERIFICATION" }] } } }),
    db.cpar.count({
      where: {
        claim: {
          AND: [visible, { status: { in: ["CPAR_APPROVED", "CAPA_MONITORING", "VERIFIED_CLOSED"] } }],
        },
      },
    }),
    db.cpar.count({
      where: {
        submittedAt: null,
        dueDate: { lt: now },
        claim: {
          AND: [visible, { status: { in: ["CPAR_ISSUED", "CPAR_IN_PROGRESS", "CPAR_REVISION"] } }],
        },
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold text-nid-orange-700">CPAR</h1>
        <p className="text-sm text-muted-foreground">
          Problem Countermeasure Request yang terlihat oleh Anda.
        </p>
      </header>

      <StatRow>
        <StatTile
          label="Sedang diisi"
          value={sedangDiisi}
          hint="Menunggu departemen penanggung jawab"
          icon={ClipboardList}
        />
        <StatTile
          label="Menunggu verifikasi"
          value={menungguVerifikasi}
          hint="Sudah dikirim, menanti empat kapasitas"
          icon={Clock3}
          tone={menungguVerifikasi > 0 ? "warning" : "neutral"}
        />
        <StatTile
          label="Lewat tenggat"
          value={lewatTenggat}
          hint="Belum dikirim melewati tanggal jatuh tempo"
          icon={TriangleAlert}
          tone={lewatTenggat > 0 ? "critical" : "neutral"}
        />
        <StatTile
          label="Sudah disetujui"
          value={disetujui}
          hint="Termasuk yang sedang dipantau dan sudah ditutup"
          icon={CircleCheckBig}
          tone={disetujui > 0 ? "good" : "neutral"}
        />
      </StatRow>

      <Card>
        <CardHeader>
          <CardTitle>CPAR terbaru</CardTitle>
          <CardDescription>
            Lima puluh terakhir. Pengguna departemen melihat CPAR departemennya dan klaim yang
            disiarkan ke seluruh portal.
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
                const overdue = cpar.dueDate < now && !cpar.submittedAt;

                return (
                  <li
                    key={cpar.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-3 first:pt-0"
                  >
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

                    {cpar.cycle > 1 ? (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] tabular">
                        siklus {cpar.cycle}
                      </span>
                    ) : null}

                    <span className="flex items-center gap-1 text-xs tabular text-muted-foreground">
                      <CalendarClock aria-hidden className="size-3.5" />
                      {formatDate(cpar.dueDate)}
                      {overdue ? (
                        <span className="flex items-center gap-1 rounded-full bg-[var(--status-danger-bg)] px-1.5 py-0.5 font-medium text-[var(--status-danger)]">
                          <TriangleAlert aria-hidden className="size-3" />
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
