import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FileText } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ReviewDecision } from "@/components/claim/review-decision";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { getPortalUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Review claim",
};

/**
 * Halaman review QA Dept. Head (§6 Modul 1 butir 4): seluruh isi klaim ditampilkan
 * sekaligus, lalu dua tombol keputusan.
 *
 * Pratinjau PDF Bad News dan Quick Information menyusul pada Fase 3; sampai saat itu
 * halaman ini menampilkan data yang sama persis dengan yang akan dicetak.
 */
export default async function ReviewClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getPortalUser();

  const claim = await db.claim.findUnique({
    where: { id },
    include: {
      parts: { orderBy: { side: "asc" } },
      productCategory: true,
      ncDetail: true,
      customer: true,
      createdBy: { select: { name: true, jobTitle: true } },
    },
  });

  if (!claim) notFound();

  const context = { status: claim.status, createdById: claim.createdById, cpar: null };

  // Klaim yang tidak sedang menunggu review tidak punya keputusan untuk diambil.
  if (!can(user, "claim.review.approve", context)) {
    redirect(`/claims/${id}`);
  }

  const partIds = claim.parts.map((part) => part.id);
  const attachments = await db.attachment.findMany({
    where: { entityType: "ClaimPart", entityId: { in: partIds } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold text-nid-orange-700">{claim.claimNo}</h1>
          <StatusBadge status={claim.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          Dikirim {claim.createdBy.name} ({claim.createdBy.jobTitle}) pada {formatDate(claim.submittedAt)}.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Ringkasan klaim</CardTitle>
          <CardDescription>Periksa kelengkapan dan ketepatannya sebelum memutuskan.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <Row label="Part" value={`${claim.partName} · ${claim.internalPartNo}`} />
          <Row label="Customer part no." value={claim.customerPartNo} />
          <Row label="Customer" value={claim.customer?.name ?? "—"} />
          <Row label="Product category" value={claim.productCategory?.name ?? "—"} />
          <Row label="Non-conformance detail" value={claim.ncDetail?.name ?? "—"} />
          <Row label="Date of occurrence" value={formatDate(claim.dateOfOccurrence)} />
          <Row label="Date of received" value={formatDate(claim.dateOfReceived)} />
          <Row label="Lot / Kanban" value={`${claim.lotNo} · ${claim.kanbanNo}`} />
          <div className="sm:col-span-2">
            <Row label="Quality problem" value={claim.qualityProblem} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Part comparison</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          {claim.parts.map((part) => {
            const photos = attachments.filter((attachment) => attachment.entityId === part.id);

            return (
              <div key={part.id} className="space-y-3 rounded-xl border border-nid-border p-4">
                <h3 className="font-display text-sm font-semibold">
                  {part.side === "STANDARD" ? "Standard Part" : "Actual"}
                </h3>

                {photos.length > 0 ? (
                  <ul className="grid grid-cols-2 gap-2">
                    {photos.map((photo) => (
                      <li key={photo.id} className="overflow-hidden rounded-lg border border-nid-border">
                        <Image
                          src={`/api/files/${photo.path}`}
                          alt={photo.caption ?? photo.originalName}
                          width={320}
                          height={240}
                          unoptimized
                          className="aspect-[4/3] w-full object-cover"
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">Belum ada foto.</p>
                )}

                <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  <Row label="Qty" value={`${Number(part.qty)} ${part.qtyUnit === "BOX" ? "Box" : "Pcs"}`} />
                  <Row label="NID part no." value={part.nidPartNo} />
                  <Row label="Dimension item" value={part.dimensionItem ?? "—"} />
                  <Row label="Appearance item" value={part.appearanceItem ?? "—"} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dokumen</CardTitle>
          <CardDescription>
            Bad News Information Form dan Quick Information for Abnormal Part di-render pada Fase 3.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2 rounded-lg border border-dashed border-nid-border px-3 py-2">
            <FileText aria-hidden className="size-4" />
            Bad News Information Form — belum tersedia
          </span>
          <span className="inline-flex items-center gap-2 rounded-lg border border-dashed border-nid-border px-3 py-2">
            <FileText aria-hidden className="size-4" />
            Quick Information for Abnormal Part — belum tersedia
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Keputusan</CardTitle>
          <CardDescription>
            Approve menerbitkan klaim ke seluruh user portal. Request revision mengembalikannya ke QA
            beserta catatan Anda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReviewDecision claimId={claim.id} />
        </CardContent>
      </Card>

      <p className="text-sm">
        <Link href={`/claims/${claim.id}`} className="text-nid-orange-700 hover:underline">
          Kembali ke detail klaim
        </Link>
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line break-words text-sm">{value || "—"}</dd>
    </div>
  );
}
