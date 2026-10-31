import { formatDate } from "@/lib/format";
import type { CountermeasureInput } from "@/schemas/countermeasure";

/**
 * Permanent countermeasure pada lembar CPAR (§9).
 *
 * Satu baris per tindakan, dengan PIC dan tanggal implementasi sebagai kolom sendiri —
 * bukan terselip di dalam kalimat. Pada lembar yang ditandatangani empat kapasitas,
 * "siapa" dan "kapan" harus terbaca tanpa membaca seluruh kalimatnya lebih dulu.
 *
 * Jumlah evidence ikut dicetak, tetapi berkasnya tidak: lembar ini adalah ringkasan yang
 * ditandatangani, sedangkan bukti yang sebenarnya dibuka di portal. Angka itu yang
 * memberi tahu pembaca bahwa ada sesuatu untuk dibuka.
 */
export function CountermeasureSheet({
  value,
  picNames,
  evidenceCounts,
}: {
  value: CountermeasureInput;
  /** Nama PIC per id; yang tidak ada lagi dicetak sebagai tanda hubung. */
  picNames: Readonly<Record<string, string>>;
  evidenceCounts: Readonly<Record<string, number>>;
}) {
  if (value.items.length === 0) {
    return <p className="m-0 min-h-[12mm]">—</p>;
  }

  return (
    <div className="space-y-[2mm]">
      <table className="w-full border-collapse text-[8pt]">
        <thead>
          <tr className="bg-[#f4f5f7]">
            <th className="w-[6mm] border border-[#e4e7eb] px-[1.5mm] py-[1mm] text-left">No</th>
            <th className="border border-[#e4e7eb] px-[1.5mm] py-[1mm] text-left">
              Tindakan perbaikan
            </th>
            <th className="w-[32mm] border border-[#e4e7eb] px-[1.5mm] py-[1mm] text-left">PIC</th>
            <th className="w-[24mm] border border-[#e4e7eb] px-[1.5mm] py-[1mm] text-left">
              Implementasi
            </th>
            <th className="w-[18mm] border border-[#e4e7eb] px-[1.5mm] py-[1mm] text-left">
              Evidence
            </th>
          </tr>
        </thead>
        <tbody>
          {value.items.map((item, index) => {
            const count = item.id ? (evidenceCounts[item.id] ?? 0) : 0;

            return (
              <tr key={item.id ?? index}>
                <td className="border border-[#e4e7eb] px-[1.5mm] py-[1mm] align-top tabular">
                  {index + 1}
                </td>
                <td className="border border-[#e4e7eb] px-[1.5mm] py-[1mm] align-top">
                  {item.action}
                  {item.note ? (
                    <div className="text-[7pt] text-[#6b7280]">{item.note}</div>
                  ) : null}
                </td>
                <td className="border border-[#e4e7eb] px-[1.5mm] py-[1mm] align-top">
                  {picNames[item.picId] ?? "—"}
                </td>
                <td className="border border-[#e4e7eb] px-[1.5mm] py-[1mm] align-top">
                  {item.implementedOn ? formatDate(item.implementedOn) : "—"}
                </td>
                <td className="border border-[#e4e7eb] px-[1.5mm] py-[1mm] align-top">
                  {count > 0 ? `${count} berkas` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {value.note ? <p className="m-0 whitespace-pre-line break-words">{value.note}</p> : null}
    </div>
  );
}
