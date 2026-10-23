import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardCheck, PencilLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatusRail } from "@/components/shared/status-rail";
import { ClaimTimeline, type TimelineEntry } from "@/components/claim/claim-timeline";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { draftLabel } from "@/lib/numbering";
import { ForbiddenError } from "@/lib/errors";
import { can, canViewClaim } from "@/lib/permissions";
import { getPortalUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Claim detail",
};

const TYPE_LABEL: Record<string, string> = {
  OFFICIAL: "Official",
  NON_OFFICIAL: "Non-Official",
  INFORMATION_ONLY: "Information Only",
};

const SHIFT_LABEL: Record<string, string> = { MORNING: "Morning", NIGHT: "Night" };

const FAILURE_PLACE_LABEL: Record<string, string> = {
  REGULAR: "Regular",
  DOMESTIC: "Domestic",
  EXPORT: "Export",
  SERVICE_PART: "Service Part",
};

const ORIGIN_LABEL: Record<string, string> = {
  NID: "NID",
  PASSTHROUGH: "Passthrough",
  VENDOR_SUBCON: "Vendor / Sub-Contractor",
};

const OCCURRENCE_LABEL: Record<string, string> = {
  FIRST_TIME: "First Time",
  SECOND_TIME: "Second Time",
  THIRD_OR_MORE: "Third or More",
};

export default async function ClaimDetailPage({ params }: { params: Promise<{ id: string }> }) {
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
      reviewedBy: { select: { name: true, jobTitle: true } },
      cpar: {
        select: {
          cparNo: true,
          cycle: true,
          dueDate: true,
          responsibleDeptId: true,
          responsibleDept: { select: { code: true, name: true } },
          cftMembers: { select: { departmentId: true } },
        },
      },
    },
  });

  if (!claim) notFound();

  const context = {
    status: claim.status,
    createdById: claim.createdById,
    cpar: claim.cpar
      ? {
          responsibleDeptId: claim.cpar.responsibleDeptId,
          cftMemberDeptIds: claim.cpar.cftMembers.map((member) => member.departmentId),
        }
      : null,
  };

  if (!canViewClaim(user, context)) {
    throw new ForbiddenError("Klaim ini bukan tanggung jawab departemen Anda.");
  }

  // Urut maju, searah dengan status rail di atas halaman — klaim dibaca dari awal
  // perjalanannya, bukan dari peristiwa terakhir.
  const audit = await db.auditLog.findMany({
    where: { claimId: id },
    orderBy: { createdAt: "asc" },
    include: { actor: { select: { name: true, jobTitle: true } } },
  });

  const entries: TimelineEntry[] = audit.map((row) => ({
    id: row.id,
    action: row.action,
    actorName: row.actor?.name ?? null,
    actorJobTitle: row.actor?.jobTitle ?? null,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    createdAt: row.createdAt,
    comment:
      row.payloadDiff && typeof row.payloadDiff === "object" && "comment" in row.payloadDiff
        ? String((row.payloadDiff as { comment: unknown }).comment)
        : null,
  }));

  const partIds = claim.parts.map((part) => part.id);
  const attachments = await db.attachment.findMany({
    where: { entityType: "ClaimPart", entityId: { in: partIds } },
    orderBy: { createdAt: "asc" },
  });

  const canEdit = can(user, "claim.update", context);
  const canReview = can(user, "claim.review.approve", context);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-bold text-nid-orange-700">
              {claim.claimNo ?? draftLabel(claim.id)}
            </h1>
            <p className="text-sm text-muted-foreground">
              {claim.type ? TYPE_LABEL[claim.type] : "Tipe belum dipilih"} · dibuat{" "}
              {claim.createdBy.name} · {formatDate(claim.createdAt)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={claim.status} showHint />

            {canEdit ? (
              <Button asChild variant="outline">
                <Link href={`/claims/${claim.id}/edit`}>
                  <PencilLine aria-hidden />
                  Edit claim information
                </Link>
              </Button>
            ) : null}

            {canReview ? (
              <Button asChild>
                <Link href={`/claims/${claim.id}/review`}>
                  <ClipboardCheck aria-hidden />
                  Review claim information
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        <Card>
          <CardContent className="p-4">
            <StatusRail status={claim.status} cycle={claim.cpar?.cycle} />
          </CardContent>
        </Card>
      </header>

      {claim.status === "REVISION_REQUESTED" && claim.reviewComment ? (
        <div className="rounded-xl border border-nid-border bg-[var(--status-pending-bg)] p-4 text-sm">
          <p className="font-medium text-[var(--status-pending)]">
            Permintaan revisi dari {claim.reviewedBy?.name ?? "QA Dept. Head"}
          </p>
          <p className="mt-1 whitespace-pre-line">{claim.reviewComment}</p>
          <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(claim.reviewedAt)}</p>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Claim Info</CardTitle>
          <CardDescription>Isi Bad News Information Form.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <Row label="Date of occurrence" value={`${formatDate(claim.dateOfOccurrence)}${claim.shiftOfOccurrence ? ` · ${SHIFT_LABEL[claim.shiftOfOccurrence]}` : ""}`} />
          <Row label="Date of received" value={`${formatDate(claim.dateOfReceived)}${claim.shiftOfReceived ? ` · ${SHIFT_LABEL[claim.shiftOfReceived]}` : ""}`} />
          <Row label="Failure place" value={`${claim.failurePlace || "—"}${claim.failurePlaceType ? ` · ${FAILURE_PLACE_LABEL[claim.failurePlaceType]}` : ""}`} />
          <Row label="Customer" value={claim.customer?.name ?? "—"} />
          <Row label="Contact person" value={claim.contactPerson} />
          <Row label="Contact email" value={claim.contactEmail} />
          <Row label="Contact phone" value={claim.contactPhone} />
          <Row label="Part name" value={claim.partName} />
          <Row label="Internal part no." value={claim.internalPartNo} />
          <Row label="Customer part no." value={claim.customerPartNo} />
          <Row label="Product category" value={claim.productCategory?.name ?? "—"} />
          <Row label="Occurrence" value={claim.occurrence ? OCCURRENCE_LABEL[claim.occurrence] : "—"} />
          <Row
            label="Production place"
            value={
              claim.originPlantType
                ? `${ORIGIN_LABEL[claim.originPlantType]}${claim.originPlantDetail ? ` — ${claim.originPlantDetail}` : ""}`
                : "—"
            }
          />
          <Row label="Non-conformance detail" value={claim.ncDetail?.name ?? "—"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Abnormal Description</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <Row label="Abnormal information source" value={claim.abnormalSource} />
          <Row label="Suspected process line" value={claim.suspectedProcessLine} />
          <Row label="Lot no." value={claim.lotNo} />
          <Row label="Kanban no." value={claim.kanbanNo} />
          <Row label="Injection date" value={formatDate(claim.injectionDate)} />
          <Row label="Assembly date" value={formatDate(claim.assemblyDate)} />
          <Row label="Delivery date" value={formatDate(claim.deliveryDate)} />
          <div className="sm:col-span-2">
            <Row label="Quality problem" value={claim.qualityProblem} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Parts &amp; Photos</CardTitle>
          <CardDescription>Perbandingan part standard dan part aktual.</CardDescription>
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
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                  <Row label="Part name" value={part.partName} />
                  <Row label="NID part no." value={part.nidPartNo} />
                  <Row
                    label="Qty"
                    value={Number(part.qty) > 0 ? `${Number(part.qty)} ${part.qtyUnit === "BOX" ? "Box" : "Pcs"}` : "—"}
                  />
                  <Row label="Photo description" value={part.photoCaption ?? "—"} />
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
          <CardTitle>Activity</CardTitle>
          <CardDescription>Seluruh perpindahan status, diambil dari audit trail.</CardDescription>
        </CardHeader>
        <CardContent>
          <ClaimTimeline entries={entries} />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Tab CPAR, Monitoring, dan Documents menyusul pada Fase 4 sampai 6.
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
