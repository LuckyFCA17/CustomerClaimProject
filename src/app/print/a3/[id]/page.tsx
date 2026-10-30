import { statusMeta } from "@/config/claim-status";
import { FormHeader, Sheet, SignatureBlock } from "@/components/print/sheet";
import { formatDate, formatDateTime } from "@/lib/format";
import { A3_BLOCKS, A3_BLOCK_LABEL } from "@/schemas/monitoring";
import { authorizePrint, loadMonitoringForPrint, readA3Content } from "@/server/print-data";

export const dynamic = "force-dynamic";

/**
 * A3 Improvement Report (§9).
 *
 * Lembar A3 yang sesungguhnya: lima blok berdampingan dalam dua kolom supaya alur
 * background → target → analysis → plan → result terbaca sekali pandang saat ditempel
 * di papan, bukan sebagai dokumen yang harus digulir.
 *
 * Blok yang tidak diisi tetap dicetak sebagai kotak kosong, karena A3 yang separuh
 * terisi memperlihatkan di mana pemikirannya berhenti — dan itu informasi juga.
 */
export default async function A3PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : null;

  await authorizePrint("A3", id, token);

  const { cpar, claim, report } = await loadMonitoringForPrint(id);
  const blocks = readA3Content(report?.a3Content);
  const isDraft = query.draft === "1" || claim.status !== "VERIFIED_CLOSED";

  return (
    <Sheet draft={isDraft}>
      <FormHeader
        formTitle="A3 Improvement Report"
        formCode="FM-QA-05 Rev.00 · A3"
        documentNo={cpar.cparNo}
        status={`${statusMeta(claim.status).label} · siklus ${cpar.cycle}`}
        printedAt={new Date()}
      />

      <div className="mb-[4mm] border-2 border-[#b45a15] bg-[#fdf1e6] px-[4mm] py-[3mm]">
        <div className="text-[8pt] uppercase tracking-wide text-[#b45a15]">Tema perbaikan</div>
        <div className="font-display text-[13pt] font-bold leading-tight">
          {claim.partName || "—"} · {claim.ncDetail?.name ?? "—"}
        </div>
        <div className="mt-[1mm] flex flex-wrap gap-x-[8mm] gap-y-[1mm] text-[8.5pt]">
          <span>
            <span className="text-[#6b7280]">Claim </span>
            <span className="font-semibold tabular">{claim.claimNo ?? "—"}</span>
          </span>
          <span>
            <span className="text-[#6b7280]">Departemen </span>
            <span className="font-semibold">{cpar.responsibleDept.code}</span>
          </span>
          <span>
            <span className="text-[#6b7280]">Ditutup </span>
            <span className="tabular">{claim.closedAt ? formatDate(claim.closedAt) : "—"}</span>
          </span>
        </div>
      </div>

      {report?.summary ? (
        <div className="mb-[3mm] border border-[#e4e7eb] px-[3mm] py-[2mm] text-[9pt]">
          <div className="text-[7.5pt] uppercase tracking-wide text-[#6b7280]">Ringkasan</div>
          <p className="m-0 mt-[0.5mm] whitespace-pre-line break-words">{report.summary}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-[3mm]">
        {A3_BLOCKS.map((block) => (
          <section key={block} className="break-inside-avoid border border-[#e4e7eb]">
            <h2 className="m-0 border-b border-[#e4e7eb] bg-[#f4f5f7] px-[3mm] py-[1.5mm] font-display text-[9pt] font-semibold uppercase tracking-wide">
              {A3_BLOCK_LABEL[block]}
            </h2>
            <p className="m-0 min-h-[26mm] whitespace-pre-line break-words px-[3mm] py-[2mm] text-[8.5pt]">
              {blocks[block] ?? ""}
            </p>
          </section>
        ))}

        {report?.lessonLearned ? (
          <section className="break-inside-avoid border border-[#e4e7eb]">
            <h2 className="m-0 border-b border-[#e4e7eb] bg-[#f4f5f7] px-[3mm] py-[1.5mm] font-display text-[9pt] font-semibold uppercase tracking-wide">
              Lesson learned
            </h2>
            <p className="m-0 min-h-[26mm] whitespace-pre-line break-words px-[3mm] py-[2mm] text-[8.5pt]">
              {report.lessonLearned}
            </p>
          </section>
        ) : null}
      </div>

      <SignatureBlock
        signatories={[
          {
            role: "Disusun",
            name: report?.submittedBy.name ?? null,
            jobTitle: report?.submittedBy.jobTitle ?? null,
            approvedAt: report?.submittedAt ?? null,
          },
          {
            role: "Diketahui QA",
            name: claim.createdBy.name,
            jobTitle: claim.createdBy.jobTitle,
            approvedAt: claim.closedAt,
          },
        ]}
      />

      {report ? null : (
        <p className="mt-[4mm] text-[8pt] italic text-[#6b7280]">
          Improvement Report belum tersimpan; lembar ini dicetak kosong sebagai kerangka kerja.
          Dicetak {formatDateTime(new Date())} WIB.
        </p>
      )}
    </Sheet>
  );
}
