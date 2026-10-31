import type { ProcessFlowInput, ProcessStep } from "@/schemas/process-flow";

/**
 * Process flow diagram pada lembar CPAR (§9).
 *
 * Proses suspek ditandai dua kali: garis tepi tebal dan label teks. Lembar ini sering
 * difotokopi hitam putih dan ditempel di papan, dan tanda yang hanya berupa warna
 * hilang pada salinan pertama.
 */
export function ProcessFlowSheet({ value }: { value: ProcessFlowInput }) {
  if (value.steps.length === 0) {
    return <p className="m-0 min-h-[12mm]">—</p>;
  }

  return (
    <div className="space-y-[2mm]">
      <div className="flex flex-wrap items-stretch gap-x-[1mm] gap-y-[2mm]">
        {/* Panah di depan, bukan di belakang: rangkaian yang membungkus ke baris
            berikutnya tidak meninggalkan panah yang menunjuk ke ruang kosong. */}
        {value.steps.map((step, index) => (
          <div key={`${step.name}-${index}`} className="flex items-center">
            {index > 0 ? (
              <span aria-hidden className="mx-[0.8mm] text-[10pt] text-[#6b7280]">
                →
              </span>
            ) : null}
            <StepBox step={step} index={index} />
          </div>
        ))}
      </div>

      <p className="m-0 text-[7pt] text-[#6b7280]">
        Garis tebal menandai proses suspek: <strong>O</strong> = occurrence (cacat terbentuk),{" "}
        <strong>F</strong> = outflow (cacat lolos).
      </p>

      {value.note ? (
        <p className="m-0 whitespace-pre-line break-words">{value.note}</p>
      ) : null}
    </div>
  );
}

function StepBox({ step, index }: { step: ProcessStep; index: number }) {
  const suspect = step.suspectOccurrence || step.suspectOutflow;

  return (
    <div
      className={`min-w-[26mm] max-w-[38mm] px-[2mm] py-[1.2mm] ${
        suspect ? "border-[0.7mm] border-[#1f2933]" : "border border-[#e4e7eb]"
      }`}
    >
      <div className="flex items-baseline gap-[1mm]">
        <span className="text-[7pt] tabular text-[#6b7280]">{index + 1}</span>
        <span className="break-words text-[8.5pt] font-semibold">{step.name}</span>
      </div>

      {step.detail ? (
        <div className="break-words text-[7pt] leading-tight text-[#6b7280]">{step.detail}</div>
      ) : null}

      {suspect ? (
        <div className="mt-[0.5mm] flex gap-[1mm] text-[7pt] font-bold">
          {step.suspectOccurrence ? <span className="border border-[#1f2933] px-[0.8mm]">O</span> : null}
          {step.suspectOutflow ? <span className="border border-[#1f2933] px-[0.8mm]">F</span> : null}
        </div>
      ) : null}
    </div>
  );
}
