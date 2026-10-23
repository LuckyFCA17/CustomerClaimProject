import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ClaimForm } from "@/components/claim/claim-form";
import { StatusBadge } from "@/components/shared/status-badge";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { draftLabel } from "@/lib/numbering";
import { getPortalUser } from "@/lib/session";
import { toDateInput } from "@/lib/format";
import { EMPTY_CLAIM_FORM, type ClaimFormValues, type PartFormValues } from "@/schemas/claim";

export const metadata: Metadata = {
  title: "Edit claim",
};

export default async function EditClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getPortalUser();

  const claim = await db.claim.findUnique({
    where: { id },
    include: {
      parts: true,
      cpar: { select: { responsibleDeptId: true, cftMembers: { select: { departmentId: true } } } },
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

  // Klaim yang sudah lewat tahap draft tidak lagi bisa disunting; pengguna diarahkan
  // ke halaman detail alih-alih diberi form yang setiap simpanannya akan ditolak server.
  if (!can(user, "claim.update", context)) {
    redirect(`/claims/${id}`);
  }

  const [productCategories, ncDetails, customers] = await Promise.all([
    db.productCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.nonConformanceDetail.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.customer.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  const partIds = claim.parts.map((part) => part.id);
  const attachments = await db.attachment.findMany({
    where: { entityType: "ClaimPart", entityId: { in: partIds } },
    orderBy: { createdAt: "asc" },
  });

  const photosFor = (side: "STANDARD" | "ACTUAL") => {
    const part = claim.parts.find((entry) => entry.side === side);
    if (!part) return [];

    return attachments
      .filter((attachment) => attachment.entityId === part.id)
      .map((attachment) => ({
        id: attachment.id,
        url: `/api/files/${attachment.path}`,
        originalName: attachment.originalName,
        caption: attachment.caption,
      }));
  };

  const partValues = (side: "STANDARD" | "ACTUAL"): PartFormValues => {
    const part = claim.parts.find((entry) => entry.side === side);
    if (!part) return { ...EMPTY_CLAIM_FORM.standard };

    return {
      partName: part.partName,
      nidPartNo: part.nidPartNo,
      // Qty 0 adalah nilai awal baris draft, bukan sesuatu yang pengguna ketik.
      qty: Number(part.qty) > 0 ? String(Number(part.qty)) : "",
      qtyUnit: part.qtyUnit,
      dimensionItem: part.dimensionItem ?? "",
      appearanceItem: part.appearanceItem ?? "",
      photoCaption: part.photoCaption ?? "",
    };
  };

  const defaultValues: ClaimFormValues = {
    ...EMPTY_CLAIM_FORM,
    type: claim.type ?? "",
    dateOfOccurrence: toDateInput(claim.dateOfOccurrence),
    shiftOfOccurrence: claim.shiftOfOccurrence ?? "",
    dateOfReceived: toDateInput(claim.dateOfReceived),
    shiftOfReceived: claim.shiftOfReceived ?? "",
    failurePlace: claim.failurePlace,
    failurePlaceType: claim.failurePlaceType ?? "",
    contactPerson: claim.contactPerson,
    contactEmail: claim.contactEmail,
    contactPhone: claim.contactPhone,
    internalPartNo: claim.internalPartNo,
    customerPartNo: claim.customerPartNo,
    partName: claim.partName,
    productCategoryId: claim.productCategoryId ?? "",
    originPlantType: claim.originPlantType ?? "",
    originPlantDetail: claim.originPlantDetail ?? "",
    occurrence: claim.occurrence ?? "",
    ncDetailId: claim.ncDetailId ?? "",
    customerId: claim.customerId ?? "",
    abnormalSource: claim.abnormalSource,
    qualityProblem: claim.qualityProblem,
    lotNo: claim.lotNo,
    kanbanNo: claim.kanbanNo,
    injectionDate: toDateInput(claim.injectionDate),
    assemblyDate: toDateInput(claim.assemblyDate),
    deliveryDate: toDateInput(claim.deliveryDate),
    suspectedProcessLine: claim.suspectedProcessLine,
    standard: partValues("STANDARD"),
    actual: partValues("ACTUAL"),
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold text-nid-orange-700">
            {claim.claimNo ?? draftLabel(claim.id)}
          </h1>
          <p className="text-sm text-muted-foreground">
            Bad News Information &amp; Quick Information for Abnormal Part.
          </p>
        </div>
        <StatusBadge status={claim.status} showHint />
      </header>

      <ClaimForm
        claimId={claim.id}
        defaultValues={defaultValues}
        masters={{
          productCategories: productCategories.map((item) => ({ id: item.id, name: item.name })),
          ncDetails: ncDetails.map((item) => ({ id: item.id, name: item.name })),
          customers: customers.map((item) => ({ id: item.id, name: item.name })),
        }}
        photos={{ standard: photosFor("STANDARD"), actual: photosFor("ACTUAL") }}
        reviewComment={claim.status === "REVISION_REQUESTED" ? claim.reviewComment : null}
      />
    </div>
  );
}
