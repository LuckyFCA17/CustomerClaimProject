import { statusMeta } from "@/config/claim-status";
import { FieldGrid, FormHeader, SectionTitle, Sheet, SignatureBlock } from "@/components/print/sheet";
import { MONITORING_STATUS_LABEL } from "@/lib/monitoring";
import { formatDate, formatDateTime } from "@/lib/format";
import { authorizePrint, loadMonitoringForPrint } from "@/server/print-data";

export const dynamic = "force-dynamic";

/**
 * CAPA Implementation Monitoring (§9).
 *
 * Inti lembar ini adalah tabel periode: tiap baris menyebut tenggat, hasil, penilainya,
 * dan catatannya. Itulah yang ditanyakan auditor — bukan apakah countermeasure dibuat,
 * melainkan apakah ada yang memeriksa bahwa ia benar-benar bekerja.
 */
export default async function MonitoringPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : null;

  await authorizePrint("MONITORING", id, token);

  const { cpar, claim, periods, report } = await loadMonitoringForPrint(id);
  const isDraft = query.draft === "1" || claim.status !== "VERIFIED_CLOSED";

  return (
    <Sheet draft={isDraft}>
      <FormHeader
        formTitle="CAPA Implementation Monitoring"
        formCode="FM-QA-04 Rev.00 · Monitoring"
        documentNo={cpar.cparNo}
        status={`${statusMeta(claim.status).label} · siklus ${cpar.cycle}`}
        printedAt={new Date()}
      />

      <FieldGrid
        rows={[
          ["Claim No.", claim.claimNo],
          ["Part name", claim.partName],
          ["Internal part no.", claim.internalPartNo],
          ["Non-conformance detail", claim.ncDetail?.name],
          ["Customer", claim.customer?.name],
          [
            "Responsible department",
            `${cpar.responsibleDept.code} — ${cpar.responsibleDept.name}`,
          ],
          ["CPAR approved", cpar.approvedAt ? formatDate(cpar.approvedAt) : null],
          ["Claim closed", claim.closedAt ? formatDate(claim.closedAt) : null],
        ]}
      />

      <SectionTitle>Periode pemantauan — siklus {cpar.cycle}</SectionTitle>

      <table className="w-full border-collapse text-[8.5pt]">
        <thead>
          <tr className="bg-[#f4f5f7]">
            <th className="w-[14mm] border border-[#e4e7eb] px-[2mm] py-[1.2mm] text-left">Periode</th>
            <th className="w-[26mm] border border-[#e4e7eb] px-[2mm] py-[1.2mm] text-left">Tenggat</th>
            <th className="w-[26mm] border border-[#e4e7eb] px-[2mm] py-[1.2mm] text-left">Hasil</th>
            <th className="w-[38mm] border border-[#e4e7eb] px-[2mm] py-[1.2mm] text-left">Dinilai oleh</th>
            <th className="border border-[#e4e7eb] px-[2mm] py-[1.2mm] text-left">Catatan</th>
          </tr>
        </thead>
        <tbody>
          {periods.length === 0 ? (
            <tr>
              <td colSpan={5} className="border border-[#e4e7eb] px-[2mm] py-[3mm] text-center">
                Belum ada periode pemantauan.
              </td>
            </tr>
          ) : (
            periods.map((period) => (
              <tr key={period.id}>
                <td className="border border-[#e4e7eb] px-[2mm] py-[1.2mm] tabular">
                  {period.periodNo}
                </td>
                <td className="border border-[#e4e7eb] px-[2mm] py-[1.2mm] tabular">
                  {formatDate(period.dueDate)}
                </td>
                <td className="border border-[#e4e7eb] px-[2mm] py-[1.2mm]">
                  {MONITORING_STATUS_LABEL[period.status]}
                </td>
                <td className="border border-[#e4e7eb] px-[2mm] py-[1.2mm]">
                  {period.filledBy
                    ? `${period.filledBy.name}${period.filledAt ? ` · ${formatDate(period.filledAt)}` : ""}`
                    : "—"}
                </td>
                <td className="whitespace-pre-line border border-[#e4e7eb] px-[2mm] py-[1.2mm]">
                  {period.note ?? "—"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {report ? (
        <>
          <SectionTitle>Improvement Report</SectionTitle>
          <div className="border border-[#e4e7eb] px-[3mm] py-[2mm] text-[9pt]">
            <p className="m-0 whitespace-pre-line break-words">{report.summary}</p>

            {report.lessonLearned ? (
              <>
                <p className="m-0 mt-[2mm] text-[7.5pt] uppercase tracking-wide text-[#6b7280]">
                  Lesson learned
                </p>
                <p className="m-0 whitespace-pre-line break-words">{report.lessonLearned}</p>
              </>
            ) : null}

            <p className="m-0 mt-[1.5mm] border-t border-dashed border-[#e4e7eb] pt-[1mm] text-[7.5pt] text-[#6b7280]">
              Disusun {report.submittedBy.name}
              {report.submittedBy.jobTitle ? ` (${report.submittedBy.jobTitle})` : ""} ·{" "}
              {formatDateTime(report.submittedAt)}
            </p>
          </div>
        </>
      ) : null}

      <SignatureBlock
        signatories={[
          {
            role: "Disusun",
            name: report?.submittedBy.name ?? null,
            jobTitle: report?.submittedBy.jobTitle ?? null,
            approvedAt: report?.submittedAt ?? null,
          },
          {
            role: "Penilai efektivitas",
            name: periods.at(-1)?.filledBy?.name ?? null,
            jobTitle: periods.at(-1)?.filledBy?.jobTitle ?? null,
            approvedAt: periods.at(-1)?.filledAt ?? null,
          },
        ]}
      />
    </Sheet>
  );
}
