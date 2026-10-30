import type { ProblemDescription, ProblemPart } from "@/server/cpar-problem";

/**
 * Problem description pada lembar CPAR (§9).
 *
 * Versi cetak dari panel yang sama di portal. Fotonya ditanam sebagai data URI oleh
 * pemanggil, karena Puppeteer membuka halaman cetak tanpa cookie sesi dan tidak akan
 * bisa mengambil /api/files yang dijaga izin.
 */
export function ProblemDescriptionSheet({ problem }: { problem: ProblemDescription }) {
  const filled = problem.fields.filter((field) => field.value !== null);

  return (
    <div className="space-y-[2mm]">
      <table className="w-full border-collapse text-[8pt]">
        <tbody>
          {chunk(filled, 2).map((pair, index) => (
            <tr key={index}>
              {pair.map((field) => (
                <td
                  key={field.label}
                  className="w-1/2 border border-[#e4e7eb] px-[2mm] py-[1mm] align-top"
                  colSpan={pair.length === 1 ? 2 : 1}
                >
                  <span className="text-[7pt] uppercase tracking-wide text-[#6b7280]">
                    {field.label}
                  </span>
                  <div className="break-words">{field.value}</div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div>
        <div className="text-[7pt] uppercase tracking-wide text-[#6b7280]">Deskripsi problem</div>
        <p className="m-0 whitespace-pre-line break-words">{problem.qualityProblem.trim() || "—"}</p>
      </div>

      <div className="grid grid-cols-2 gap-[2mm]">
        {problem.parts.map((part) => (
          <PartBlock key={part.side} part={part} />
        ))}
      </div>
    </div>
  );
}

function PartBlock({ part }: { part: ProblemPart }) {
  const rows = [
    ["Part name", part.partName],
    ["NID part no.", part.nidPartNo],
    ["Qty", part.qty],
    ["Dimension", part.dimensionItem],
    ["Appearance", part.appearanceItem],
  ] as const;

  return (
    <section className="border border-[#e4e7eb]">
      <h4 className="m-0 border-b border-[#e4e7eb] bg-[#f4f5f7] px-[2mm] py-[1mm] text-[7.5pt] font-semibold uppercase tracking-wide">
        {part.title}
      </h4>

      <div className="space-y-[1.5mm] p-[2mm]">
        {part.photos.length > 0 ? (
          <div className="grid grid-cols-2 gap-[1.5mm]">
            {part.photos.slice(0, 2).map((photo) => (
              /* eslint-disable-next-line @next/next/no-img-element -- Puppeteer mencetak
                 halaman statis; pengoptimal gambar Next tidak ikut berjalan di sana. */
              <img
                key={photo.id}
                src={photo.url}
                alt={photo.caption ?? part.title}
                className="h-[28mm] w-full border border-[#e4e7eb] object-cover"
              />
            ))}
          </div>
        ) : (
          <div className="grid h-[20mm] place-items-center border border-dashed border-[#e4e7eb] text-[7pt] text-[#6b7280]">
            Tidak ada foto
          </div>
        )}

        <table className="w-full border-collapse text-[7.5pt]">
          <tbody>
            {rows
              .filter(([, value]) => value !== null)
              .map(([label, value]) => (
                <tr key={label}>
                  <td className="w-[22mm] py-[0.3mm] align-top text-[#6b7280]">{label}</td>
                  <td className="py-[0.3mm] align-top break-words">{value}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}
