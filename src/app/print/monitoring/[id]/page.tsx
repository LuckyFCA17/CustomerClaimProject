import { statusMeta } from "@/config/claim-status";
import { FieldGrid, FormHeader, SectionTitle, Sheet, SignatureBlock } from "@/components/print/sheet";
import {
  CHECK_JUDGEMENT_SHORT,
  MONITORING_STATUS_LABEL,
  calendarRows,
  resultsOfKind,
  totalResults,
} from "@/lib/monitoring";
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

  const { cpar, claim, periods, checkItems, checks, results, report } =
    await loadMonitoringForPrint(id);
  const days = calendarRows(results);
  const production = totalResults(resultsOfKind(results, "PRODUCTION"));
  const inspection = totalResults(resultsOfKind(results, "INSPECTION"));
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

      {checkItems.length > 0 ? (
        <>
          <SectionTitle>Item yang dipantau</SectionTitle>
          <table className="mb-[3mm] w-full border-collapse text-[8pt]">
            <thead>
              <tr className="bg-[#f4f5f7]">
                <th className="w-[6mm] border border-[#e4e7eb] px-[2mm] py-[1.2mm] text-left">
                  No.
                </th>
                <th className="border border-[#e4e7eb] px-[2mm] py-[1.2mm] text-left">
                  Item yang dipantau
                </th>
                {periods.map((period) => (
                  <th
                    key={period.id}
                    className="w-[14mm] border border-[#e4e7eb] px-[2mm] py-[1.2mm] text-center"
                  >
                    P{period.periodNo}
                  </th>
                ))}
                <th className="border border-[#e4e7eb] px-[2mm] py-[1.2mm] text-left">
                  Catatan hasil pemantauan
                </th>
              </tr>
            </thead>
            <tbody>
              {checkItems.map((item) => {
                // Catatan tiap periode disatukan pada satu sel, diberi penanda
                // periodenya. Satu kolom catatan per periode akan menyempitkan tabel
                // sampai tidak terbaca begitu periodenya lebih dari tiga.
                const notes = periods
                  .map((period) => ({
                    periodNo: period.periodNo,
                    check: checks.find(
                      (entry) => entry.periodId === period.id && entry.itemId === item.id,
                    ),
                  }))
                  .filter((entry) => Boolean(entry.check?.note));

                return (
                  <tr key={item.id} className="break-inside-avoid">
                    <td className="border border-[#e4e7eb] px-[2mm] py-[1.2mm] tabular">
                      {item.order}
                    </td>
                    <td className="border border-[#e4e7eb] px-[2mm] py-[1.2mm]">{item.title}</td>

                    {periods.map((period) => {
                      const check = checks.find(
                        (entry) => entry.periodId === period.id && entry.itemId === item.id,
                      );
                      const judgement = check?.judgement ?? "PENDING";

                      return (
                        <td
                          key={period.id}
                          className={`border border-[#e4e7eb] px-[2mm] py-[1.2mm] text-center ${
                            judgement === "NG" ? "font-semibold text-[#b91c1c]" : ""
                          }`}
                        >
                          {CHECK_JUDGEMENT_SHORT[judgement]}
                        </td>
                      );
                    })}

                    <td className="whitespace-pre-line border border-[#e4e7eb] px-[2mm] py-[1.2mm]">
                      {notes.length === 0
                        ? "—"
                        : notes
                            .map((entry) => `P${entry.periodNo}: ${entry.check?.note ?? ""}`)
                            .join("\n")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      ) : null}

      {days.length > 0 ? (
        <>
          <SectionTitle>Hasil produksi &amp; inspeksi per tanggal</SectionTitle>
          <table className="mb-[3mm] w-full border-collapse text-[8pt]">
            <thead>
              <tr className="bg-[#f4f5f7]">
                <th rowSpan={2} className="border border-[#e4e7eb] px-[2mm] py-[1.2mm] text-left">
                  Tanggal
                </th>
                <th colSpan={3} className="border border-[#e4e7eb] px-[2mm] py-[1.2mm] text-center">
                  Produksi
                </th>
                <th colSpan={3} className="border border-[#e4e7eb] px-[2mm] py-[1.2mm] text-center">
                  Inspeksi
                </th>
              </tr>
              <tr className="bg-[#f4f5f7]">
                {["Jml", "OK", "NG", "Jml", "OK", "NG"].map((head, index) => (
                  <th
                    key={`${head}-${index}`}
                    className="w-[16mm] border border-[#e4e7eb] px-[2mm] py-[1mm] text-right font-normal"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day.day}>
                  <td className="border border-[#e4e7eb] px-[2mm] py-[1.2mm] tabular">
                    {formatDate(day.date)}
                  </td>
                  <Cells totals={day.production} />
                  <Cells totals={day.inspection} />
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#f4f5f7] font-semibold">
                <td className="border border-[#e4e7eb] px-[2mm] py-[1.2mm]">Total</td>
                <Cells totals={production} />
                <Cells totals={inspection} />
              </tr>
            </tfoot>
          </table>

          <p className="m-0 mb-[3mm] text-[8pt] text-[#6b7280]">
            Bagian NG dari yang dinilai — produksi{" "}
            <strong className="text-[#1f2933]">{percent(production.ngRate)}</strong>, inspeksi{" "}
            <strong className="text-[#1f2933]">{percent(inspection.ngRate)}</strong>.
          </p>
        </>
      ) : null}

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

function Cells({
  totals,
}: {
  totals: { quantity: number; okCount: number; ngCount: number };
}) {
  const empty = totals.quantity === 0 && totals.okCount === 0 && totals.ngCount === 0;
  const cell = "border border-[#e4e7eb] px-[2mm] py-[1.2mm] text-right tabular";

  return (
    <>
      <td className={cell}>{empty ? "—" : totals.quantity.toLocaleString("id-ID")}</td>
      <td className={cell}>{empty ? "—" : totals.okCount.toLocaleString("id-ID")}</td>
      <td className={cell}>{empty ? "—" : totals.ngCount.toLocaleString("id-ID")}</td>
    </>
  );
}

function percent(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(2)}%`;
}
