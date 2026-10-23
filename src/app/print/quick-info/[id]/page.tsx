import { statusMeta } from "@/config/claim-status";
import { FormHeader, PhotoRow, SectionTitle, Sheet, SignatureBlock } from "@/components/print/sheet";
import { formatDate } from "@/lib/format";
import { draftLabel } from "@/lib/numbering";
import {
  OCCURRENCE_LABEL,
  TYPE_LABEL,
  authorizePrint,
  loadClaimForPrint,
  photosForParts,
} from "@/server/print-data";

export const dynamic = "force-dynamic";

/**
 * Quick Information for Abnormal Part (§9).
 *
 * Bukan ringkasan Bad News, melainkan lembar yang berbeda tujuannya: ditempel di line
 * produksi agar operator mengenali part bermasalah dalam sekali lihat. Karena itu
 * fotonya besar, teksnya sedikit, dan bagian terpenting — apa yang harus dilakukan —
 * berada di bawah perbandingan foto.
 */
export default async function QuickInfoPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : null;

  await authorizePrint("QUICK_INFO", id, token);

  const claim = await loadClaimForPrint(id);
  const photos = await photosForParts(claim.parts.map((part) => part.id));

  const standard = claim.parts.find((part) => part.side === "STANDARD");
  const actual = claim.parts.find((part) => part.side === "ACTUAL");

  const isDraft = query.draft === "1" || claim.status === "DRAFT";

  return (
    <Sheet draft={isDraft}>
      <FormHeader
        formTitle="Quick Information"
        formCode="FM-QA-02 Rev.00 · Abnormal Part"
        documentNo={claim.claimNo ?? draftLabel(claim.id)}
        status={statusMeta(claim.status).label}
        printedAt={new Date()}
      />

      <div className="mb-[4mm] border-2 border-[#b45a15] bg-[#fdf1e6] px-[4mm] py-[3mm]">
        <div className="text-[8pt] uppercase tracking-wide text-[#b45a15]">Part bermasalah</div>
        <div className="font-display text-[16pt] font-bold leading-tight">{claim.partName || "—"}</div>
        <div className="mt-[1mm] flex flex-wrap gap-x-[8mm] gap-y-[1mm] text-[9pt]">
          <span>
            <span className="text-[#6b7280]">Internal </span>
            <span className="font-semibold tabular">{claim.internalPartNo || "—"}</span>
          </span>
          <span>
            <span className="text-[#6b7280]">Customer </span>
            <span className="font-semibold tabular">{claim.customerPartNo || "—"}</span>
          </span>
          <span>
            <span className="text-[#6b7280]">Lot </span>
            <span className="font-semibold tabular">{claim.lotNo || "—"}</span>
          </span>
          <span>
            <span className="text-[#6b7280]">Kanban </span>
            <span className="font-semibold tabular">{claim.kanbanNo || "—"}</span>
          </span>
        </div>
      </div>

      <SectionTitle>Perbandingan visual</SectionTitle>
      <div className="grid grid-cols-2 gap-[4mm]">
        {[
          { label: "STANDARD — seperti ini yang benar", part: standard, tone: "#15803d" },
          { label: "ACTUAL — temuan di pelanggan", part: actual, tone: "#b91c1c" },
        ].map(({ label, part, tone }) => (
          <div key={label}>
            <div
              className="mb-[1.5mm] px-[2mm] py-[1mm] text-[8pt] font-semibold uppercase tracking-wide text-white"
              style={{ backgroundColor: tone }}
            >
              {label}
            </div>

            <PhotoRow
              size="large"
              photos={part ? (photos.get(part.id) ?? []) : []}
              emptyLabel={part?.side === "STANDARD" ? "Foto standard tidak dilampirkan" : "Tidak ada foto"}
            />

            <div className="mt-[1.5mm] text-[8.5pt] leading-snug">
              <div>
                <span className="text-[#6b7280]">Dimension </span>
                {part?.dimensionItem || "—"}
              </div>
              <div>
                <span className="text-[#6b7280]">Appearance </span>
                {part?.appearanceItem || "—"}
              </div>
              <div>
                <span className="text-[#6b7280]">Qty </span>
                {part && Number(part.qty) > 0
                  ? `${Number(part.qty)} ${part.qtyUnit === "BOX" ? "Box" : "Pcs"}`
                  : "—"}
              </div>
            </div>
          </div>
        ))}
      </div>

      <SectionTitle>Keterangan abnormal</SectionTitle>
      <p className="whitespace-pre-line border border-[#e4e7eb] px-[3mm] py-[2.5mm] text-[9.5pt] leading-relaxed">
        {claim.qualityProblem || "—"}
      </p>

      <SectionTitle>Yang perlu diperhatikan</SectionTitle>
      <table className="w-full border-collapse text-[9pt]">
        <tbody>
          <tr>
            <Cell label="Non-conformance" value={claim.ncDetail?.name} />
            <Cell label="Product category" value={claim.productCategory?.name} />
            <Cell
              label="Occurrence"
              value={claim.occurrence ? OCCURRENCE_LABEL[claim.occurrence] : undefined}
            />
          </tr>
          <tr>
            <Cell label="Suspected process line" value={claim.suspectedProcessLine} />
            <Cell
              label="Production date"
              value={
                claim.injectionDate || claim.assemblyDate
                  ? [claim.injectionDate, claim.assemblyDate]
                      .filter(Boolean)
                      .map((date) => formatDate(date))
                      .join(" / ")
                  : undefined
              }
            />
            <Cell label="Delivery date" value={claim.deliveryDate ? formatDate(claim.deliveryDate) : undefined} />
          </tr>
          <tr>
            <Cell label="Type of claim" value={claim.type ? TYPE_LABEL[claim.type] : undefined} />
            <Cell label="Customer" value={claim.customer?.name} />
            <Cell
              label="Diterima"
              value={claim.dateOfReceived ? formatDate(claim.dateOfReceived) : undefined}
            />
          </tr>
        </tbody>
      </table>

      <SignatureBlock
        signatories={[
          {
            role: "Issued by — QA",
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

function Cell({ label, value }: { label: string; value?: string | null }) {
  return (
    <td className="w-1/3 border border-[#e4e7eb] px-[3mm] py-[1.8mm] align-top">
      <div className="text-[7.5pt] uppercase tracking-wide text-[#6b7280]">{label}</div>
      <div className="mt-[0.5mm] break-words">{value || "—"}</div>
    </td>
  );
}
