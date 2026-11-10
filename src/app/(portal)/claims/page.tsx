import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FilePlus2, Sheet } from "lucide-react";

import { ClaimFilters, type CustomerOption } from "@/components/claims/claim-filters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DueChip } from "@/components/shared/due-chip";
import { StatusBadge } from "@/components/shared/status-badge";
import { closureTiming } from "@/config/claim-status";
import { db } from "@/lib/db";
import {
  type ParamValue,
  claimFilterWhere,
  claimOrderBy,
  claimQueryString,
  hasActiveFilter,
  pageRange,
  parseClaimQuery,
} from "@/lib/claim-filters";
import { draftLabel } from "@/lib/numbering";
import { can, visibleClaimsWhere } from "@/lib/permissions";
import { getPortalUser } from "@/lib/session";
import { formatDate } from "@/lib/format";
import { createClaimDraft } from "@/server/actions/claim";

export const metadata: Metadata = {
  title: "Claims",
};

const TYPE_LABEL: Record<string, string> = {
  OFFICIAL: "Official",
  NON_OFFICIAL: "Non-Official",
  INFORMATION_ONLY: "Information Only",
};

/**
 * Daftar klaim — register yang menggantikan log Excel lama.
 *
 * Penyaringan, pengurutan, dan paginasi seluruhnya dikerjakan basis data, bukan di
 * peramban: register ini tumbuh terus, dan mengirim seluruh isinya ke peramban untuk
 * disaring di sana akan melambat persis ketika datanya mulai berguna.
 *
 * Aturan visibilitas tetap terpisah dari penyaring dan selalu dipasang lebih dulu —
 * filter apa pun yang dikirim lewat alamat tidak dapat memperlebar apa yang boleh
 * dilihat seseorang.
 */
export default async function ClaimsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, ParamValue>>;
}) {
  const [user, params] = await Promise.all([getPortalUser(), searchParams]);
  const query = parseClaimQuery(params);
  // Satu `now` untuk seluruh daftar: dua baris pada halaman yang sama tidak boleh
  // dihitung terhadap detik yang berbeda.
  const now = new Date();

  const where = { AND: [visibleClaimsWhere(user), claimFilterWhere(query)] };

  const [total, customers] = await Promise.all([
    db.claim.count({ where }),
    db.customer.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const range = pageRange(total, query);

  const claims = await db.claim.findMany({
    where,
    orderBy: claimOrderBy(query.sort),
    skip: range.skip,
    take: query.perPage,
    select: {
      id: true,
      claimNo: true,
      status: true,
      closedAt: true,
      type: true,
      partName: true,
      internalPartNo: true,
      dateOfOccurrence: true,
      createdAt: true,
      customer: { select: { name: true } },
      createdBy: { select: { name: true } },
      cpar: {
        select: {
          cparNo: true,
          dueDate: true,
          submittedAt: true,
          responsibleDept: { select: { code: true } },
        },
      },
    },
  });

  const customerOptions: CustomerOption[] = customers;
  const filtered = hasActiveFilter(query);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold text-nid-orange-700">Claims</h1>
          <p className="text-sm text-muted-foreground">
            Register klaim pelanggan. Menggantikan log Excel yang lama.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/*
            Ekspor membawa penyaring yang sedang berlaku, bukan seluruh register:
            orang yang menekannya baru saja menyusun penyaring itu.
          */}
          {can(user, "claim.export") ? (
            <Button type="button" size="lg" variant="outline" asChild>
              <a href={`/api/claims/export${claimQueryString(query, { page: 1 })}`} download>
                <Sheet aria-hidden />
                Export Excel
              </a>
            </Button>
          ) : null}

          {can(user, "claim.create") ? (
            <form action={createClaimDraft}>
              <Button type="submit" size="lg">
                <FilePlus2 aria-hidden />
                Issue new claim
              </Button>
            </form>
          ) : null}
        </div>
      </header>

      <Card>
        <CardHeader>
          <ClaimFilters query={query} customers={customerOptions} />
        </CardHeader>

        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-y border-nid-border px-5 py-2.5 text-xs text-muted-foreground">
            <p aria-live="polite">
              {total === 0
                ? "Tidak ada klaim yang cocok"
                : `Menampilkan ${range.firstRow}–${range.lastRow} dari ${total} klaim`}
              {filtered ? " (tersaring)" : ""}
            </p>
            <p>
              Hanya klaim yang menjadi tanggung jawab Anda, ditambah klaim yang sudah terbit.
            </p>
          </div>

          {claims.length === 0 ? (
            <div className="space-y-3 px-5 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                {filtered
                  ? "Tidak ada klaim yang cocok dengan penyaring ini."
                  : "Belum ada klaim yang dapat Anda lihat."}
              </p>
              {filtered ? (
                <Button type="button" size="sm" variant="outline" asChild>
                  <Link href="/claims">Hapus penyaring</Link>
                </Button>
              ) : null}
            </div>
          ) : (
            <ul className="divide-y divide-nid-border">
              {claims.map((claim) => (
                <li key={claim.id}>
                  <Link
                    href={`/claims/${claim.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-secondary"
                  >
                    <span className="w-full sm:w-44">
                      <span className="block font-medium tabular">
                        {claim.claimNo ?? draftLabel(claim.id)}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {claim.type ? TYPE_LABEL[claim.type] : "Jenis belum dipilih"}
                      </span>
                    </span>

                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block truncate">{claim.partName || "Part belum diisi"}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {claim.internalPartNo || "—"}
                        {claim.customer ? ` · ${claim.customer.name}` : ""}
                        {claim.cpar
                          ? ` · ${claim.cpar.cparNo} (${claim.cpar.responsibleDept.code})`
                          : ""}
                        {" · "}
                        {claim.dateOfOccurrence
                          ? `Terjadi ${formatDate(claim.dateOfOccurrence)}`
                          : `Dibuat ${formatDate(claim.createdAt)}`}
                        {" · "}
                        {claim.createdBy.name}
                      </span>
                    </span>

                    {/* Tenggat klaim adalah tenggat CPAR-nya; klaim yang belum
                        menerbitkan CPAR memang belum punya tenggat, jadi chip-nya
                        tidak muncul sama sekali. */}
                    <DueChip
                      dueDate={claim.cpar?.dueDate}
                      now={now}
                      settled={claim.cpar?.submittedAt !== null}
                    />

                    <StatusBadge
                      status={claim.status}
                      closure={closureTiming(claim.closedAt, claim.cpar?.dueDate)}
                      showHint
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {range.pageCount > 1 ? (
        <nav
          aria-label="Halaman daftar klaim"
          className="flex items-center justify-between gap-3 text-sm"
        >
          <PageLink
            href={`/claims${claimQueryString(query, { page: range.page - 1 })}`}
            disabled={range.page <= 1}
          >
            <ChevronLeft aria-hidden className="size-4" />
            Sebelumnya
          </PageLink>

          <span className="text-muted-foreground tabular">
            Halaman {range.page} dari {range.pageCount}
          </span>

          <PageLink
            href={`/claims${claimQueryString(query, { page: range.page + 1 })}`}
            disabled={range.page >= range.pageCount}
          >
            Berikutnya
            <ChevronRight aria-hidden className="size-4" />
          </PageLink>
        </nav>
      ) : null}
    </div>
  );
}

/**
 * Tautan halaman yang nonaktif tetap digambar, tetapi sebagai teks biasa.
 *
 * Tautan yang tampak dapat ditekan padahal tidak ke mana-mana lebih membingungkan
 * daripada tautan yang jelas-jelas redup, dan menghilangkannya sama sekali membuat
 * tombol "Berikutnya" berpindah tempat setiap kali halaman berganti.
 */
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
