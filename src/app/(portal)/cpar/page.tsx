import type { Metadata } from "next";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  ClipboardList,
  Clock3,
  TriangleAlert,
} from "lucide-react";

import { ClaimFilters, type CustomerOption } from "@/components/claims/claim-filters";
import { EvidenceFilters, PendingEvidenceTable } from "@/components/cpar/pending-evidence";
import { StatRow, StatTile } from "@/components/shared/stat-tile";
import { DueChip } from "@/components/shared/due-chip";
import { StatusBadge } from "@/components/shared/status-badge";
import { closureTiming } from "@/config/claim-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ClaimQuery,
  type ParamValue,
  claimFilterWhere,
  claimQueryString,
  cparOrderBy,
  hasActiveFilter,
  pageRange,
  parseClaimQuery,
} from "@/lib/claim-filters";
import { db } from "@/lib/db";
import {
  evidenceParams,
  filterEvidenceRows,
  hasActiveEvidenceFilter,
  parseEvidenceQuery,
  sortEvidenceRows,
  tallyEvidence,
} from "@/lib/evidence-requests";
import { visibleClaimsWhere } from "@/lib/permissions";
import { getPortalUser } from "@/lib/session";
import { loadEvidenceRequests } from "@/server/evidence-requests";

export const metadata: Metadata = {
  title: "CPAR",
};

/**
 * Dasbor CPAR: empat angka kepala, lalu dua tabel.
 *
 * Tabel pertama menjawab "CPAR apa yang berkaitan dengan saya", tabel kedua menjawab
 * "apa yang masih ditunggu dari saya". Keduanya dipisah karena dua pertanyaan itu
 * dijawab pada waktu yang berbeda: yang pertama saat menelusuri, yang kedua saat
 * membereskan pekerjaan — dan satu tabel gabungan akan melayani keduanya dengan buruk.
 *
 * Keduanya membaca alamat halaman dengan awalan parameter yang berbeda, sehingga
 * menyaring yang satu tidak menyentuh yang lain dan tampilan apa pun tetap dapat
 * ditandai maupun dibagikan.
 */
export default async function CparDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, ParamValue>>;
}) {
  const [user, params] = await Promise.all([getPortalUser(), searchParams]);

  const listQuery = parseClaimQuery(params);
  const pendingQuery = parseEvidenceQuery(params);

  const visible = visibleClaimsWhere(user);
  const now = new Date();

  const where = { claim: { AND: [visible, claimFilterWhere(listQuery)] } };

  const [total, customers, allRequests, sedangDiisi, menungguVerifikasi, disetujui, lewatTenggat] =
    await Promise.all([
      db.cpar.count({ where }),
      db.customer.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      loadEvidenceRequests(user),
      db.cpar.count({
        where: {
          claim: { AND: [visible, { status: { in: ["CPAR_ISSUED", "CPAR_IN_PROGRESS"] } }] },
        },
      }),
      db.cpar.count({ where: { claim: { AND: [visible, { status: "CPAR_UNDER_VERIFICATION" }] } } }),
      db.cpar.count({
        where: {
          claim: {
            AND: [
              visible,
              { status: { in: ["CPAR_APPROVED", "CAPA_MONITORING", "VERIFIED_CLOSED"] } },
            ],
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

  const listRange = pageRange(total, listQuery);

  const cpars = await db.cpar.findMany({
    where,
    orderBy: cparOrderBy(listQuery.sort),
    skip: listRange.skip,
    take: listQuery.perPage,
    select: {
      id: true,
      cparNo: true,
      cycle: true,
      dueDate: true,
      submittedAt: true,
      responsibleDept: { select: { code: true } },
      claim: {
        select: {
          id: true,
          claimNo: true,
          status: true,
          closedAt: true,
          partName: true,
          internalPartNo: true,
          customer: { select: { name: true } },
        },
      },
    },
  });

  const matching = filterEvidenceRows(allRequests, pendingQuery, user.id, now);
  const pendingRange = pageRange(matching.length, pendingQuery);
  const pendingRows = sortEvidenceRows(matching, pendingQuery.sort, now).slice(
    pendingRange.skip,
    pendingRange.skip + pendingQuery.perPage,
  );
  const tally = tallyEvidence(allRequests, now);

  // Tiap tabel menitipkan parameternya pada form tabel yang lain, supaya menyaring
  // salah satunya tidak menghapus penyaring tetangganya.
  const listParams = queryRecord(listQuery);
  const pendingParams = evidenceParams(pendingQuery);

  const customerOptions: CustomerOption[] = customers;

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
        <CardHeader className="space-y-4">
          <div className="space-y-1">
            <CardTitle>Daftar CPAR</CardTitle>
            <CardDescription>
              CPAR yang berkaitan dengan Anda — departemen Anda sebagai penanggung jawab atau
              anggota CFT, ditambah klaim yang disiarkan ke seluruh portal.
            </CardDescription>
          </div>

          <ClaimFilters
            query={listQuery}
            customers={customerOptions}
            action="/cpar"
            hidden={pendingParams}
          />
        </CardHeader>

        <CardContent className="p-0">
          <p
            aria-live="polite"
            className="border-y border-nid-border px-5 py-2.5 text-xs text-muted-foreground"
          >
            {total === 0
              ? "Tidak ada CPAR yang cocok"
              : `Menampilkan ${listRange.firstRow}–${listRange.lastRow} dari ${total} CPAR`}
            {hasActiveFilter(listQuery) ? " (tersaring)" : ""}
          </p>

          {cpars.length === 0 ? (
            <div className="space-y-3 px-5 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                {hasActiveFilter(listQuery)
                  ? "Tidak ada CPAR yang cocok dengan penyaring ini."
                  : "Belum ada CPAR yang terlihat oleh Anda."}
              </p>
              {hasActiveFilter(listQuery) ? (
                <Button type="button" size="sm" variant="outline" asChild>
                  <Link href={{ pathname: "/cpar", query: pendingParams }}>Hapus penyaring</Link>
                </Button>
              ) : null}
            </div>
          ) : (
            <ul className="divide-y divide-nid-border">
              {cpars.map((cpar) => (
                  <li key={cpar.id}>
                    <Link
                      href={`/cpar/${cpar.claim.id}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3.5 transition-colors hover:bg-secondary"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-medium tabular text-nid-orange-700">
                          {cpar.cparNo}
                        </span>
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">
                          {cpar.claim.claimNo} · {cpar.claim.partName} ·{" "}
                          {cpar.claim.internalPartNo}
                          {cpar.claim.customer ? ` · ${cpar.claim.customer.name}` : ""}
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

                      {/* Tenggat yang sudah dipenuhi tidak lagi diperingatkan: begitu
                          CPAR dikirim, yang menarik bukan lagi sisa harinya. */}
                      <DueChip
                        dueDate={cpar.dueDate}
                        now={now}
                        settled={cpar.submittedAt !== null}
                      />

                      {/* Pada klaim yang sudah ditutup, badge-nya menyebutkan sekalian
                          apakah penutupannya di dalam tenggat atau melewatinya. */}
                      <StatusBadge
                        status={cpar.claim.status}
                        closure={closureTiming(cpar.claim.closedAt, cpar.dueDate)}
                        showHint
                      />
                    </Link>
                  </li>
              ))}
            </ul>
          )}
        </CardContent>

        <Pager
          base="/cpar"
          params={{ ...pendingParams }}
          queryFor={(page) => stripLeadingQuestion(claimQueryString(listQuery, { page }))}
          range={listRange}
          label="Halaman daftar CPAR"
        />
      </Card>

      <Card>
        <CardHeader className="space-y-4">
          <div className="space-y-1">
            <CardTitle>Action & evidence pending</CardTitle>
            <CardDescription>
              Permintaan yang muncul saat pengisian CPAR: dokumen awal yang diminta, serta
              tindakan pada perbaikan tetap dan standardisasi. Hanya CPAR yang masih dapat diisi
              — setelah dikirim, section-nya terkunci dan tidak ada yang bisa dilampirkan lagi.
            </CardDescription>
          </div>

          <EvidenceFilters query={pendingQuery} action="/cpar" hidden={listParams} />
        </CardHeader>

        <CardContent className="p-0">
          <p
            aria-live="polite"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-nid-border px-5 py-2.5 text-xs text-muted-foreground"
          >
            <span>
              {matching.length === 0
                ? "Tidak ada permintaan yang cocok"
                : `Menampilkan ${pendingRange.firstRow}–${pendingRange.lastRow} dari ${matching.length} permintaan`}
              {hasActiveEvidenceFilter(pendingQuery) ? " (tersaring)" : ""}
            </span>
            <span>
              Seluruhnya: {tally.overdue} lewat tenggat · {tally.pending} menunggu · {tally.done}{" "}
              sudah dilampirkan
            </span>
          </p>

          {pendingRows.length === 0 ? (
            <div className="space-y-3 px-5 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                {hasActiveEvidenceFilter(pendingQuery)
                  ? "Tidak ada permintaan yang cocok dengan penyaring ini."
                  : "Tidak ada permintaan evidence pada CPAR yang sedang berjalan."}
              </p>
              {hasActiveEvidenceFilter(pendingQuery) ? (
                <Button type="button" size="sm" variant="outline" asChild>
                  <Link href={{ pathname: "/cpar", query: listParams }}>Hapus penyaring</Link>
                </Button>
              ) : null}
            </div>
          ) : (
            <PendingEvidenceTable rows={pendingRows} now={now} />
          )}
        </CardContent>

        <Pager
          base="/cpar"
          params={{ ...listParams }}
          queryFor={(page) =>
            new URLSearchParams(evidenceParams(pendingQuery, { page })).toString()
          }
          range={pendingRange}
          label="Halaman permintaan evidence"
        />
      </Card>
    </div>
  );
}

/** Parameter daftar CPAR sebagai record, untuk dititipkan ke form tabel sebelah. */
function queryRecord(query: ClaimQuery): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(claimQueryString(query)));
}

function stripLeadingQuestion(text: string): string {
  return text.startsWith("?") ? text.slice(1) : text;
}

function Pager({
  base,
  params,
  queryFor,
  range,
  label,
}: {
  base: string;
  /** Parameter tabel sebelah yang harus ikut terbawa. */
  params: Record<string, string>;
  queryFor: (page: number) => string;
  range: { page: number; pageCount: number };
  label: string;
}) {
  if (range.pageCount <= 1) return null;

  const href = (page: number) => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of new URLSearchParams(queryFor(page))) merged.set(key, value);
    const text = merged.toString();

    return text ? `${base}?${text}` : base;
  };

  return (
    <nav
      aria-label={label}
      className="flex items-center justify-between gap-3 border-t border-nid-border px-5 py-3 text-sm"
    >
      <PageLink href={href(range.page - 1)} disabled={range.page <= 1}>
        <ChevronLeft aria-hidden className="size-4" />
        Sebelumnya
      </PageLink>

      <span className="text-muted-foreground tabular">
        Halaman {range.page} dari {range.pageCount}
      </span>

      <PageLink href={href(range.page + 1)} disabled={range.page >= range.pageCount}>
        Berikutnya
        <ChevronRight aria-hidden className="size-4" />
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-2 text-muted-foreground opacity-50">
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 font-medium text-nid-orange-700 hover:bg-secondary"
    >
      {children}
    </Link>
  );
}
