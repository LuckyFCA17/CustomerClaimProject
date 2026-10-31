import { Fishbone } from "@/components/cpar/fishbone";
import {
  CATEGORY_LABEL,
  JUDGEMENT_SHORT,
  type RootCauseInput,
  factorsWithWhys,
  filledWhys,
} from "@/schemas/root-cause";

/**
 * Analisis akar masalah pada lembar CPAR (§9): diagram tulang ikan lalu tabel 4M1E.
 *
 * Judgement dicetak sebagai singkatan, dan faktor NG ditebalkan — bukan diberi warna.
 * Lembar ini sering difotokopi hitam putih, dan tanda yang hanya berupa warna hilang
 * pada salinan pertama.
 */
/**
 * Rantai 5 Why pada lembar cetak.
 *
 * Satu baris tabel per tingkat, bukan satu sel panjang: lembar ini dibaca berjejer dengan
 * tabel 4M1E di atasnya, dan rantai yang ditumpuk dalam satu sel kehilangan nomor
 * tingkatnya begitu teksnya membungkus. Jawaban terdalam ditebalkan — bukan diberi warna,
 * karena lembarnya difotokopi hitam putih.
 */
function WhyChains({ value }: { value: RootCauseInput }) {
  const factors = factorsWithWhys(value);
  if (factors.length === 0) return null;

  return (
    <div className="space-y-[1.5mm]">
      <div className="text-[7pt] uppercase tracking-wide text-[#6b7280]">Analisis 5 Why</div>

      {factors.map((factor, index) => {
        const whys = filledWhys(factor);

        return (
          <div key={`${factor.item}-${index}`} className="break-inside-avoid">
            <div className="text-[8pt] font-semibold">
              {CATEGORY_LABEL[factor.category]} — {factor.item}
            </div>

            <table className="w-full border-collapse text-[8pt]">
              <tbody>
                {whys.map((why, level) => (
                  <tr key={level}>
                    <td className="w-[14mm] border border-[#e4e7eb] px-[1.5mm] py-[0.8mm] align-top text-[7pt] text-[#6b7280]">
                      Why {level + 1}
                    </td>
                    <td
                      className={`border border-[#e4e7eb] px-[1.5mm] py-[0.8mm] align-top ${
                        level === whys.length - 1 ? "font-bold" : ""
                      }`}
                    >
                      {why}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

export function RootCauseSheet({ value }: { value: RootCauseInput }) {
  if (value.factors.length === 0) {
    return <p className="m-0 min-h-[12mm]">—</p>;
  }

  return (
    <div className="space-y-[2mm]">
      <div className="break-inside-avoid">
        <Fishbone value={value} compact />
      </div>

      <table className="w-full border-collapse text-[8pt]">
        <thead>
          <tr className="bg-[#f4f5f7]">
            <th className="w-[20mm] border border-[#e4e7eb] px-[1.5mm] py-[1mm] text-left">4M1E</th>
            <th className="border border-[#e4e7eb] px-[1.5mm] py-[1mm] text-left">Item</th>
            <th className="border border-[#e4e7eb] px-[1.5mm] py-[1mm] text-left">Control point</th>
            <th className="border border-[#e4e7eb] px-[1.5mm] py-[1mm] text-left">Kondisi aktual</th>
            <th className="w-[16mm] border border-[#e4e7eb] px-[1.5mm] py-[1mm] text-left">Judge</th>
          </tr>
        </thead>
        <tbody>
          {value.factors.map((factor, index) => (
            <tr key={`${factor.item}-${index}`}>
              <td className="border border-[#e4e7eb] px-[1.5mm] py-[1mm] align-top">
                {CATEGORY_LABEL[factor.category]}
              </td>
              <td className="border border-[#e4e7eb] px-[1.5mm] py-[1mm] align-top">
                {factor.item}
                {factor.note ? (
                  <div className="text-[7pt] text-[#6b7280]">{factor.note}</div>
                ) : null}
              </td>
              <td className="border border-[#e4e7eb] px-[1.5mm] py-[1mm] align-top">
                {factor.controlPoint || "—"}
              </td>
              <td className="border border-[#e4e7eb] px-[1.5mm] py-[1mm] align-top">
                {factor.actual || "—"}
              </td>
              <td
                className={`border border-[#e4e7eb] px-[1.5mm] py-[1mm] align-top ${
                  factor.judgement === "NG" ? "font-bold" : ""
                }`}
              >
                {JUDGEMENT_SHORT[factor.judgement]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <WhyChains value={value} />

      {value.conclusion ? (
        <div>
          <div className="text-[7pt] uppercase tracking-wide text-[#6b7280]">Kesimpulan</div>
          <p className="m-0 whitespace-pre-line break-words">{value.conclusion}</p>
        </div>
      ) : null}
    </div>
  );
}
