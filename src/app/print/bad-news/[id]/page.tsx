import { statusMeta } from "@/config/claim-status";
import { FieldGrid, FormHeader, PhotoRow, SectionTitle, Sheet, SignatureBlock } from "@/components/print/sheet";
import { formatDate } from "@/lib/format";
import { draftLabel } from "@/lib/numbering";
import {
  FAILURE_PLACE_LABEL,
  OCCURRENCE_LABEL,
  ORIGIN_LABEL,
  SHIFT_LABEL,
  TYPE_LABEL,
  authorizePrint,
  loadClaimForPrint,
  photosForParts,
} from "@/server/print-data";

export const dynamic = "force-dynamic";

/**
 * Bad News Information Form (§9).
 *
 * Lembar lengkap: seluruh isi §7 bagian A, B, dan C dalam satu A4, ditutup blok
 * tanda tangan QA Staff dan QA Dept. Head.
 */
export default async function BadNewsPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : null;

  await authorizePrint("BAD_NEWS", id, token);

  const claim = await loadClaimForPrint(id);
  const photos = await photosForParts(claim.parts.map((part) => part.id));

  const standard = claim.parts.find((part) => part.side === "STANDARD");
  const actual = claim.parts.find((part) => part.side === "ACTUAL");

  const isDraft = query.draft === "1" || claim.status === "DRAFT";

  return (
    <Sheet draft={isDraft}>
      <FormHeader
        formTitle="Bad News Information"
        formCode="FM-QA-01 Rev.00"
        documentNo={claim.claimNo ?? draftLabel(claim.id)}
        status={statusMeta(claim.status).label}
        printedAt={new Date()}
      />

      <SectionTitle>A. Claim Information</SectionTitle>
      <FieldGrid
        rows={[
          ["Type of claim", claim.type ? TYPE_LABEL[claim.type] : null],
          [
            "Date of occurrence",
            claim.dateOfOccurrence
              ? `${formatDate(claim.dateOfOccurrence)}${claim.shiftOfOccurrence ? ` · ${SHIFT_LABEL[claim.shiftOfOccurrence]}` : ""}`
              : null,
          ],
          [
            "Date of received",
            claim.dateOfReceived
              ? `${formatDate(claim.dateOfReceived)}${claim.shiftOfReceived ? ` · ${SHIFT_LABEL[claim.shiftOfReceived]}` : ""}`
              : null,
          ],
          [
            "Failure place",
            claim.failurePlace
              ? `${claim.failurePlace}${claim.failurePlaceType ? ` · ${FAILURE_PLACE_LABEL[claim.failurePlaceType]}` : ""}`
              : null,
          ],
          ["Customer", claim.customer?.name],
          ["Contact person", claim.contactPerson],
          ["Contact email", claim.contactEmail],
          ["Contact phone", claim.contactPhone],
          ["Part name", claim.partName],
          ["Internal part no.", claim.internalPartNo],
          ["Customer part no.", claim.customerPartNo],
          ["Product category", claim.productCategory?.name],
          ["Occurrence", claim.occurrence ? OCCURRENCE_LABEL[claim.occurrence] : null],
          [
            "Production place",
            claim.originPlantType
              ? `${ORIGIN_LABEL[claim.originPlantType]}${claim.originPlantDetail ? ` — ${claim.originPlantDetail}` : ""}`
              : null,
          ],
          ["Non-conformance detail", claim.ncDetail?.name],
        ]}
      />

      <SectionTitle>B. Abnormal Description</SectionTitle>
      <FieldGrid
        rows={[
          ["Abnormal information source", claim.abnormalSource],
          ["Suspected process line", claim.suspectedProcessLine],
          ["Lot no.", claim.lotNo],
          ["Kanban no.", claim.kanbanNo],
          ["Injection date", claim.injectionDate ? formatDate(claim.injectionDate) : null],
          ["Assembly date", claim.assemblyDate ? formatDate(claim.assemblyDate) : null],
          ["Delivery date", claim.deliveryDate ? formatDate(claim.deliveryDate) : null],
        ]}
      />
      <div className="mt-[2mm]">
        <FieldGrid rows={[["Quality problem", claim.qualityProblem]]} columns={1} />
      </div>

      <SectionTitle>C. Part Comparison</SectionTitle>
      <div className="grid grid-cols-2 gap-[3mm]">
        {[
          { label: "Standard Part", part: standard },
          { label: "Actual", part: actual },
        ].map(({ label, part }) => (
          <div key={label} className="border border-[#e4e7eb] p-[2.5mm]">
            <div className="mb-[2mm] font-display text-[8.5pt] font-semibold uppercase tracking-wide">
              {label}
            </div>

            <PhotoRow photos={part ? (photos.get(part.id) ?? []) : []} />

            <div className="mt-[2mm] space-y-[1mm] text-[8.5pt]">
              <PrintRow label="Part name" value={part?.partName} />
              <PrintRow label="NID part no." value={part?.nidPartNo} />
              <PrintRow
                label="Qty"
                value={
                  part && Number(part.qty) > 0
                    ? `${Number(part.qty)} ${part.qtyUnit === "BOX" ? "Box" : "Pcs"}`
                    : undefined
                }
              />
              <PrintRow label="Dimension item" value={part?.dimensionItem ?? undefined} />
              <PrintRow label="Appearance item" value={part?.appearanceItem ?? undefined} />
              <PrintRow label="Photo description" value={part?.photoCaption ?? undefined} />
            </div>
          </div>
        ))}
      </div>

      <SignatureBlock
        signatories={[
          {
            role: "Prepared by — QA Staff",
            name: claim.createdBy.name,
            jobTitle: claim.createdBy.jobTitle,
            approvedAt: claim.submittedAt,
          },
          {
            role: "Approved by — QA Dept. Head",
            name: claim.reviewedBy?.name ?? null,
            jobTitle: claim.reviewedBy?.jobTitle ?? null,
            approvedAt: claim.publishedAt,
          },
        ]}
      />
    </Sheet>
  );
}

function PrintRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex gap-[2mm]">
      <span className="w-[28mm] shrink-0 text-[#6b7280]">{label}</span>
      <span className="min-w-0 flex-1 break-words">{value || "—"}</span>
    </div>
  );
}
