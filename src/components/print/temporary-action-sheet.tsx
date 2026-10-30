import { type TemporaryActionInput, templateFor } from "@/schemas/temporary-action";

/**
 * Temporary Corrective Action pada lembar CPAR (§9).
 *
 * Tabel, bukan paragraf — sama seperti di portal. Angka sortir adalah bagian lembar ini
 * yang paling sering dibaca ulang saat audit, dan angka yang berdiri di kolomnya sendiri
 * dapat dijumlahkan dengan mata.
 */
export function TemporaryActionSheet({ value }: { value: TemporaryActionInput }) {
  if (value.entries.length === 0) {
    return <p className="m-0 min-h-[12mm]">—</p>;
  }

  const tracksResult = value.entries.some((entry) => templateFor(entry.kind).tracksResult);

  return (
    <div className="space-y-[1.5mm]">
      <table className="w-full border-collapse text-[8.5pt]">
        <thead>
          <tr className="bg-[#f4f5f7]">
            <th className="border border-[#e4e7eb] px-[2mm] py-[1mm] text-left">Tindakan</th>
            <th className="w-[16mm] border border-[#e4e7eb] px-[2mm] py-[1mm] text-right">Pcs</th>
            <th className="w-[16mm] border border-[#e4e7eb] px-[2mm] py-[1mm] text-right">Bags</th>
            {tracksResult ? (
              <>
                <th className="w-[16mm] border border-[#e4e7eb] px-[2mm] py-[1mm] text-right">OK</th>
                <th className="w-[16mm] border border-[#e4e7eb] px-[2mm] py-[1mm] text-right">NG</th>
              </>
            ) : null}
            <th className="border border-[#e4e7eb] px-[2mm] py-[1mm] text-left">Keterangan</th>
          </tr>
        </thead>
        <tbody>
          {value.entries.map((entry, index) => {
            const result = templateFor(entry.kind).tracksResult;

            return (
              <tr key={`${entry.kind}-${index}`}>
                <td className="border border-[#e4e7eb] px-[2mm] py-[1mm] align-top">
                  <div>{entry.label}</div>
                  {entry.performedOn ? (
                    <div className="text-[7pt] text-[#6b7280]">{entry.performedOn}</div>
                  ) : null}
                </td>
                <td className="border border-[#e4e7eb] px-[2mm] py-[1mm] text-right align-top tabular">
                  {entry.totalPcs ?? "—"}
                </td>
                <td className="border border-[#e4e7eb] px-[2mm] py-[1mm] text-right align-top tabular">
                  {entry.totalBags ?? "—"}
                </td>
                {tracksResult ? (
                  <>
                    <td className="border border-[#e4e7eb] px-[2mm] py-[1mm] text-right align-top tabular">
                      {result ? (entry.okPcs ?? "—") : "—"}
                    </td>
                    <td className="border border-[#e4e7eb] px-[2mm] py-[1mm] text-right align-top tabular">
                      {result ? (entry.ngPcs ?? "—") : "—"}
                    </td>
                  </>
                ) : null}
                <td className="border border-[#e4e7eb] px-[2mm] py-[1mm] align-top">
                  {entry.note || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {value.note ? (
        <p className="m-0 whitespace-pre-line break-words">{value.note}</p>
      ) : null}
    </div>
  );
}
