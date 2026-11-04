import type { Metadata } from "next";
import Link from "next/link";

import { MonthlyColumns } from "@/components/dashboard/monthly-columns";
import { ParetoBars } from "@/components/dashboard/pareto-bars";
import { PeriodFilter } from "@/components/dashboard/period-filter";
import { StatTile } from "@/components/dashboard/stat-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABEL } from "@/config/navigation";
import { availableTransitions } from "@/lib/claim-state";
import { monthlySeries, paretoRows, resolvePeriod } from "@/lib/dashboard";
import { toJakartaParts } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { draftLabel } from "@/lib/numbering";
import { can, visibleClaimsWhere, type Actor, type ClaimContext } from "@/lib/permissions";
import { getPortalUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Dashboard",
};

/** Berapa banyak baris "butuh tindakan" yang ditampilkan sebelum menunjuk ke daftar klaim. */
const ACTION_ROWS = 8;

/**
 * Halaman pembuka portal (§7 Fase 7).
 *
 * Seluruh angkanya melewati `visibleClaimsWhere()`, jadi dua orang dengan peran berbeda
 * melihat dashboard yang berbeda pula — bukan satu ringkasan global yang kebetulan
 * disembunyikan sebagian di halaman lain.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getPortalUser();
  const where = visibleClaimsWhere(user);
  const now = new Date();

  const query = await searchParams;
  const one = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  // Satu periode dipakai grafik dan pareto, supaya keduanya menjawab pertanyaan
  // tentang rentang waktu yang sama. Nilainya dibersihkan di `resolvePeriod`, karena
  // ia datang dari URL dan langsung menjadi batas query.
  const period = resolvePeriod(one(query.from), one(query.to), now);

  const [
    recent,
    ncGroups,
    ncNames,
    openClaims,
    overdueCpar,
    closedRecently,
    actionable,
    oldestClaim,
  ] = await Promise.all([
      db.claim.findMany({
        where: { ...where, createdAt: { gte: period.start, lt: period.end } },
        select: { createdAt: true },
      }),
      db.claim.groupBy({
        by: ["ncDetailId"],
        where: {
          ...where,
          createdAt: { gte: period.start, lt: period.end },
          ncDetailId: { not: null },
        },
        _count: { _all: true },
      }),
      db.nonConformanceDetail.findMany({ select: { id: true, name: true } }),
      db.claim.count({
        where: { ...where, status: { notIn: ["VERIFIED_CLOSED", "IGNORED"] } },
      }),
      db.cpar.count({
        where: { claim: where, submittedAt: null, dueDate: { lt: now } },
      }),
      db.claim.count({
        where: {
          ...where,
          status: "VERIFIED_CLOSED",
          closedAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      db.claim.findMany({
        where: { ...where, status: { notIn: ["VERIFIED_CLOSED", "IGNORED"] } },
        orderBy: { updatedAt: "asc" },
        select: {
          id: true,
          claimNo: true,
          status: true,
          partName: true,
          internalPartNo: true,
          createdById: true,
          updatedAt: true,
          cpar: {
            select: {
              cparNo: true,
              cycle: true,
              dueDate: true,
              responsibleDeptId: true,
              responsibleDept: { select: { code: true } },
              cftMembers: { select: { departmentId: true } },
            },
          },
        },
      }),
      // Hanya untuk mengetahui sejak tahun berapa pemilih periode perlu menawarkan.
      db.claim.findFirst({
        where,
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
    ]);

  const series = monthlySeries(
    recent.map((claim) => claim.createdAt),
    period.anchor,
    period.months,
  );

  /**
   * Tahun yang boleh dipilih.
   *
   * Dari tahun klaim terlama sampai tahun berjalan — menawarkan tahun yang tidak punya
   * satu pun klaim hanya menghasilkan grafik kosong yang terlihat seperti kerusakan.
   * Tahun periode yang sedang aktif selalu ikut, supaya tautan lama tetap dapat
   * menampilkan pilihannya sendiri.
   */
  const thisYear = toJakartaParts(now).year;
  const oldestClaimYear = oldestClaim ? toJakartaParts(oldestClaim.createdAt).year : null;
  const years = [
    ...new Set([
      ...range(oldestClaimYear ?? thisYear, thisYear),
      Number(period.from.slice(0, 4)),
      Number(period.to.slice(0, 4)),
    ]),
  ].sort((a, b) => b - a);

  const nameById = new Map(ncNames.map((detail) => [detail.id, detail.name]));
  const pareto = paretoRows(
    ncGroups.map((group) => ({
      label: group.ncDetailId ? (nameById.get(group.ncDetailId) ?? "Tidak dikenal") : "Tidak diisi",
      count: group._count._all,
    })),
  );

  const mine = actionable.filter((claim) => pendingActions(user, claim).length > 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold text-nid-orange-700">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Masuk sebagai {user.name} — {user.roles.map((role) => ROLE_LABEL[role]).join(", ")}
          {user.departmentCode ? ` · Dept ${user.departmentCode}` : ""}.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Butuh tindakan Anda"
          value={mine.length}
          tone="attention"
          hint="klaim yang menunggu keputusan Anda"
        />
        <StatTile
          label="Klaim berjalan"
          value={openClaims}
          href="/claims"
          hint="belum ditutup maupun diabaikan"
        />
        <StatTile
          label="CPAR lewat tenggat"
          value={overdueCpar}
          tone="attention"
          href="/cpar"
          hint="sudah jatuh tempo, belum dikirim"
        />
        <StatTile label="Ditutup 30 hari terakhir" value={closedRecently} hint="Verified Closed" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Butuh tindakan Anda</CardTitle>
          <CardDescription>
            Klaim yang perpindahan statusnya terbuka bagi peran Anda, paling lama tidak
            tersentuh di urutan atas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mine.length === 0 ? (
            <p className="rounded-lg border border-dashed border-nid-border px-3 py-6 text-center text-sm text-muted-foreground">
              Tidak ada yang menunggu Anda saat ini.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-nid-border">
                {mine.slice(0, ACTION_ROWS).map((claim) => {
                  const actions = pendingActions(user, claim);

                  return (
                    <li key={claim.id} className="py-3">
                      <Link
                        href={`/claims/${claim.id}`}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 hover:underline"
                      >
                        <span className="font-medium tabular">
                          {claim.claimNo ?? draftLabel(claim.id)}
                        </span>
                        {/* Lebar minimum, bukan `min-w-0`: bila ruangnya kurang, nama part
                            pindah ke baris berikutnya alih-alih terperas menjadi "Clip …". */}
                        <span
                          className="min-w-[11rem] flex-1 truncate text-sm text-muted-foreground"
                          title={`${claim.partName} · ${claim.internalPartNo}`}
                        >
                          {claim.partName} · {claim.internalPartNo}
                          {claim.cpar
                            ? ` · ${claim.cpar.cparNo} (${claim.cpar.responsibleDept.code}, siklus ${claim.cpar.cycle})`
                            : ""}
                        </span>
                        <StatusBadge status={claim.status} />
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {actions.join(" · ")} — terakhir bergerak {formatDate(claim.updatedAt)}
                      </p>
                    </li>
                  );
                })}
              </ul>

              {mine.length > ACTION_ROWS ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  {mine.length - ACTION_ROWS} klaim lain juga menunggu Anda —{" "}
                  <Link href="/claims" className="text-nid-orange-700 hover:underline">
                    lihat seluruh daftar
                  </Link>
                  .
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Periode grafik</CardTitle>
          <CardDescription>
            Berlaku untuk kedua grafik di bawah. Kartu angka di atas tidak ikut berubah —
            semuanya menjawab pertanyaan tentang keadaan sekarang, bukan tentang periode.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PeriodFilter
            from={period.from}
            to={period.to}
            years={years}
            isDefault={period.isDefault}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Klaim per bulan</CardTitle>
            <CardDescription>
              {period.label}, menurut tanggal klaim dicatat (kalender Jakarta).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyColumns series={series} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pareto non-conformance detail</CardTitle>
            <CardDescription>
              Sebab terbanyak pada {period.label}. Yang berwarna aksen adalah sebab yang
              bersama-sama menjelaskan 80% kasus.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ParetoBars rows={pareto} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface ActionableClaim {
  readonly status: ClaimContext["status"];
  readonly createdById: string;
  readonly cpar: {
    readonly responsibleDeptId: string;
    readonly cftMembers: readonly { readonly departmentId: string }[];
  } | null;
}

/**
 * Nama perpindahan yang benar-benar boleh dipicu pengguna ini atas klaim ini.
 *
 * Dua lapis, sama seperti di server action: `availableTransitions` menyaring menurut
 * peran, `can()` menyaring menurut cakupan (ALL / OWNER / DEPT). Memakai satu lapis saja
 * membuat dashboard menjanjikan tindakan yang akan ditolak begitu tombolnya ditekan —
 * misalnya meminta seluruh Dept. Head mengisi CPAR milik departemen lain.
 */
/** Deret tahun menaik, kedua ujungnya ikut. */
function range(from: number, to: number): number[] {
  const years: number[] = [];

  for (let year = Math.min(from, to); year <= Math.max(from, to); year += 1) years.push(year);

  return years;
}

function pendingActions(actor: Actor, claim: ActionableClaim): readonly string[] {
  const context: ClaimContext = {
    status: claim.status,
    createdById: claim.createdById,
    cpar: claim.cpar
      ? {
          responsibleDeptId: claim.cpar.responsibleDeptId,
          cftMemberDeptIds: claim.cpar.cftMembers.map((member) => member.departmentId),
        }
      : null,
  };

  const labels = availableTransitions(claim.status, actor.roles)
    .filter((transition) => can(actor, transition.action, context))
    .map((transition) => transition.label);

  return [...new Set(labels)];
}
