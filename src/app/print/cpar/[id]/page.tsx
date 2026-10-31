import { statusMeta } from "@/config/claim-status";
import { FieldGrid, FormHeader, SectionTitle, Sheet, SignatureBlock } from "@/components/print/sheet";
import type { RoleCode } from "@/generated/prisma/enums";
import {
  SECTION_INDEX,
  SECTION_LABEL,
  SECTION_ORDER,
  VERIFIER_CAPACITY_LABEL,
  isDerivedSection,
  isStructuredSection,
  requiredVerifiers,
} from "@/lib/cpar";
import { formatDate, formatDateTime } from "@/lib/format";
import { ProblemDescriptionSheet } from "@/components/print/problem-sheet";
import { ProcessFlowSheet } from "@/components/print/process-flow-sheet";
import { TemporaryActionSheet } from "@/components/print/temporary-action-sheet";
import { readProcessFlow } from "@/schemas/process-flow";
import { readTemporaryAction } from "@/schemas/temporary-action";
import { loadProblemDescription } from "@/server/cpar-problem";
import { TYPE_LABEL, authorizePrint, loadCparForPrint } from "@/server/print-data";

export const dynamic = "force-dynamic";

/**
 * Corrective & Preventive Action Request (§9).
 *
 * Isi tujuh section dicetak apa adanya dalam urutan form, masing-masing dengan nama
 * pengisi dan waktunya — itulah yang membedakan lembar ini dari sekadar ringkasan:
 * auditor perlu tahu siapa yang menyatakan apa, bukan hanya apa yang dinyatakan.
 *
 * Selama belum disetujui seluruh verifier, lembar diberi watermark DRAFT lewat
 * `Sheet draft`, supaya salinan yang beredar lebih awal tidak tertukar dengan yang sah.
 */
export default async function CparPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : null;

  await authorizePrint("CPAR", id, token);

  const cpar = await loadCparForPrint(id);
  const problem = await loadProblemDescription(id, { embedPhotos: true });
  const claim = cpar.claim;
  const isDraft = query.draft === "1" || cpar.approvedAt === null;

  const sections = SECTION_ORDER.map((key) => ({
    key,
    record: cpar.sections.find((section) => section.key === key) ?? null,
  }));

  // Hanya keputusan siklus berjalan yang mengisi blok tanda tangan: siklus sebelumnya
  // sudah ditutup oleh satu REVISE, dan mencetaknya di sini akan terbaca seolah CPAR
  // ini pernah disetujui padahal belum.
  const currentCycle = cpar.verifications.filter((entry) => entry.cycle === cpar.cycle);

  const signatories = requiredVerifiers().map((role: RoleCode) => {
    const decision = currentCycle.find(
      (entry) => entry.role === role && entry.decision === "VERIFIED",
    );

    return {
      role: VERIFIER_CAPACITY_LABEL[role] ?? role,
      name: decision?.verifier.name ?? null,
      jobTitle: decision?.verifier.jobTitle ?? null,
      approvedAt: decision?.decidedAt ?? null,
    };
  });

  const earlierCycles = cpar.verifications.filter((entry) => entry.cycle < cpar.cycle);

  return (
    <Sheet draft={isDraft}>
      <FormHeader
        formTitle="Corrective & Preventive Action Request"
        formCode="FM-QA-03 Rev.00 · CPAR"
        documentNo={cpar.cparNo}
        status={`${statusMeta(claim.status).label} · siklus ${cpar.cycle}`}
        printedAt={new Date()}
      />

      <FieldGrid
        rows={[
          ["Claim No.", claim.claimNo],
          ["Type of claim", claim.type ? (TYPE_LABEL[claim.type] ?? claim.type) : null],
          ["Part name", claim.partName],
          ["Internal part no.", claim.internalPartNo],
          ["Customer", claim.customer?.name],
          ["Non-conformance detail", claim.ncDetail?.name],
          [
            "Responsibility",
            cpar.responsibilityType === "CFT" ? "Cross Functional Team" : "User Department",
          ],
          [
            cpar.responsibilityType === "CFT" ? "Lead department" : "Responsible department",
            `${cpar.responsibleDept.code} — ${cpar.responsibleDept.name}`,
          ],
          [
            "CFT members",
            cpar.cftMembers.length > 0
              ? cpar.cftMembers.map((member) => member.department.code).join(", ")
              : null,
          ],
          ["Issued", formatDate(cpar.issuedAt)],
          ["Due date", formatDate(cpar.dueDate)],
          ["Submitted", cpar.submittedAt ? formatDateTime(cpar.submittedAt) : null],
        ]}
      />

      {sections.map(({ key, record }) => (
        <div key={key} className="break-inside-avoid">
          <SectionTitle>
            {SECTION_INDEX[key]}. {SECTION_LABEL[key]}
          </SectionTitle>

          <div className="border border-[#e4e7eb] px-[3mm] py-[2mm] text-[9pt]">
            {isDerivedSection(key) ? (
              <ProblemDescriptionSheet problem={problem} />
            ) : key === "PROCESS_FLOW" ? (
              <ProcessFlowSheet value={readProcessFlow(record?.data)} />
            ) : isStructuredSection(key) ? (
              <TemporaryActionSheet value={readTemporaryAction(record?.data)} />
            ) : (
              <p className="m-0 min-h-[12mm] whitespace-pre-line break-words">
                {record?.content?.trim() || "—"}
              </p>
            )}

            {record?.filledBy && !isDerivedSection(key) ? (
              <p className="m-0 mt-[1.5mm] border-t border-dashed border-[#e4e7eb] pt-[1mm] text-[7.5pt] text-[#6b7280]">
                Diisi {record.filledBy.name}
                {record.filledBy.jobTitle ? ` (${record.filledBy.jobTitle})` : ""}
                {record.filledAt ? ` · ${formatDateTime(record.filledAt)}` : ""}
              </p>
            ) : null}
          </div>
        </div>
      ))}

      {earlierCycles.length > 0 ? (
        <>
          <SectionTitle>Riwayat siklus sebelumnya</SectionTitle>
          <table className="w-full border-collapse text-[8.5pt]">
            <thead>
              <tr className="bg-[#f4f5f7]">
                <th className="border border-[#e4e7eb] px-[2mm] py-[1.2mm] text-left">Siklus</th>
                <th className="border border-[#e4e7eb] px-[2mm] py-[1.2mm] text-left">Kapasitas</th>
                <th className="border border-[#e4e7eb] px-[2mm] py-[1.2mm] text-left">Keputusan</th>
                <th className="border border-[#e4e7eb] px-[2mm] py-[1.2mm] text-left">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {earlierCycles.map((entry) => (
                <tr key={entry.id}>
                  <td className="border border-[#e4e7eb] px-[2mm] py-[1.2mm] tabular">
                    #{entry.cycle}
                  </td>
                  <td className="border border-[#e4e7eb] px-[2mm] py-[1.2mm]">
                    {VERIFIER_CAPACITY_LABEL[entry.role] ?? entry.role}
                  </td>
                  <td className="border border-[#e4e7eb] px-[2mm] py-[1.2mm]">
                    {entry.decision === "VERIFIED" ? "Verified" : "Needs revision"}
                  </td>
                  <td className="border border-[#e4e7eb] px-[2mm] py-[1.2mm] whitespace-pre-line">
                    {entry.comment ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      <SignatureBlock signatories={signatories} />
    </Sheet>
  );
}
