import Link from "next/link";
import { ExternalLink } from "lucide-react";

import type { ProblemDescription, ProblemPart } from "@/server/cpar-problem";

/**
 * Section 1 CPAR — Problem description, dibaca langsung dari klaimnya.
 *
 * Tidak ada kotak isian di sini. Seluruh keterangannya sudah dimasukkan QA saat
 * menerbitkan klaim, dan klaim tidak dapat diubah lagi setelah terbit; menyalinnya
 * ke kotak teks hanya menciptakan salinan kedua yang bisa berbeda dari aslinya.
 */
export function ProblemDescriptionPanel({ problem }: { problem: ProblemDescription }) {
  const filled = problem.fields.filter((field) => field.value !== null);
  const missing = problem.fields.filter((field) => field.value === null);

  return (
    <div className="space-y-4">
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {filled.map((field) => (
          <div key={field.label} className="min-w-0">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {field.label}
            </dt>
            <dd className="mt-0.5 break-words text-sm">{field.value}</dd>
          </div>
        ))}
      </dl>

      {missing.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Belum terisi pada klaim: {missing.map((field) => field.label).join(", ")}.
        </p>
      ) : null}

      <div>
        <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Deskripsi problem</h4>
        <p className="mt-1 whitespace-pre-line break-words text-sm">
          {problem.qualityProblem.trim() || "—"}
        </p>
      </div>

      {problem.abnormalSource ? (
        <div>
          <h4 className="text-xs uppercase tracking-wide text-muted-foreground">
            Sumber informasi abnormal
          </h4>
          <p className="mt-1 break-words text-sm">{problem.abnormalSource}</p>
        </div>
      ) : null}

      <div>
        <h4 className="text-xs uppercase tracking-wide text-muted-foreground">
          Perbandingan standard dan actual
        </h4>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {problem.parts.map((part) => (
            <PartCard key={part.side} part={part} />
          ))}
        </div>
      </div>

      <Link
        href={`/claims/${problem.claimId}`}
        className="inline-flex items-center gap-1.5 text-sm text-nid-orange-700 hover:underline"
      >
        Buka klaim {problem.claimNo ?? ""}
        <ExternalLink aria-hidden className="size-3.5" />
      </Link>
    </div>
  );
}

function PartCard({ part }: { part: ProblemPart }) {
  const rows = [
    ["Part name", part.partName],
    ["NID part no.", part.nidPartNo],
    ["Qty", part.qty],
    ["Dimension", part.dimensionItem],
    ["Appearance", part.appearanceItem],
  ] as const;

  return (
    <section className="rounded-lg border border-nid-border">
      <h5 className="border-b border-nid-border bg-secondary px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">
        {part.title}
      </h5>

      <div className="space-y-2 p-3">
        {part.photos.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {part.photos.map((photo) => (
              <figure key={photo.id} className="m-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- berkas dilayani
                    /api/files yang dijaga izin; pengoptimal gambar Next tidak melewatinya. */}
                <img
                  src={photo.url}
                  alt={photo.caption ?? `Foto ${part.title}`}
                  className="h-28 w-full rounded-md border border-nid-border object-cover"
                />
                {photo.caption ? (
                  <figcaption className="mt-1 text-[11px] leading-tight text-muted-foreground">
                    {photo.caption}
                  </figcaption>
                ) : null}
              </figure>
            ))}
          </div>
        ) : (
          <p className="grid h-20 place-items-center rounded-md border border-dashed border-nid-border text-xs text-muted-foreground">
            Tidak ada foto
          </p>
        )}

        <dl className="space-y-1">
          {rows
            .filter(([, value]) => value !== null)
            .map(([label, value]) => (
              <div key={label} className="flex gap-2 text-xs">
                <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
                <dd className="min-w-0 break-words">{value}</dd>
              </div>
            ))}
        </dl>
      </div>
    </section>
  );
}
