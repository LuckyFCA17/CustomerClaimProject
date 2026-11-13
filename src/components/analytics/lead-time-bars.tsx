import { type LeadTimeSummary, formatDays } from "@/lib/analytics";

/**
 * Lama tiap tahap, dalam hari kalender.
 *
 * Satu sumbu — hari — dan satu batang per tahap, diskalakan terhadap tahap terlama.
 * Tahap yang paling panjang batangnya adalah tempat waktunya habis, dan itulah satu
 * pertanyaan yang dijawab grafik ini.
 *
 * **Jumlah sampel tercetak di tiap baris, dan itu bukan hiasan.** Klaim yang belum
 * disetujui belum punya lama verifikasi, sehingga median satu tahap bisa berasal dari
 * tiga klaim sementara tahap di sebelahnya dari empat puluh. Median yang disandingkan
 * tanpa menyebut sampelnya mengundang perbandingan yang tidak sah.
 */
export function LeadTimeBars({ summary }: { summary: LeadTimeSummary }) {
  const measured = summary.stages.filter((stage) => stage.medianDays !== null);

  if (measured.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-nid-border px-3 py-6 text-center text-sm text-muted-foreground">
        Belum ada klaim yang melewati satu tahap pun secara utuh pada periode ini.
      </p>
    );
  }

  const max = Math.max(...measured.map((stage) => stage.medianDays ?? 0));

  return (
    <figure className="m-0 space-y-4">
      <div className="rounded-lg bg-secondary px-3 py-2.5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Diterima sampai ditutup
        </p>
        <p className="mt-0.5 text-2xl font-semibold leading-none">
          {formatDays(summary.totalMedianDays)}
          {summary.totalMedianDays === null ? null : (
            <span className="ml-1.5 text-sm font-normal text-muted-foreground">kerja</span>
          )}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Median dari {summary.totalSample} klaim yang sudah selesai sepenuhnya.
        </p>
      </div>

      <ul className="space-y-3">
        {summary.stages.map((stage) => (
          <li key={stage.stage}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-sm font-medium">{stage.label}</span>
              <span className="text-sm tabular text-muted-foreground">
                <strong className="font-semibold text-foreground">
                  {formatDays(stage.medianDays)}
                </strong>{" "}
                · {stage.sample} klaim
              </span>
            </div>

            <div
              className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-secondary"
              role="img"
              aria-label={`${stage.label}: median ${formatDays(stage.medianDays)} dari ${stage.sample} klaim`}
            >
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${max === 0 || !stage.medianDays ? 0 : Math.max(2, (stage.medianDays / max) * 100)}%`,
                  backgroundColor: "var(--nid-orange-600)",
                }}
              />
            </div>

            {/*
              "Terlama" hanya disebut bila ia memang lebih lambat daripada mediannya.
              Pada sebaran yang rapat keduanya bernilai sama, dan mencetak keduanya
              hanya menambah satu baris yang tidak memberi tahu apa pun.
            */}
            <p className="mt-1 text-xs text-muted-foreground">
              {stage.hint}
              {stage.slowestDays !== null &&
              stage.medianDays !== null &&
              stage.slowestDays > stage.medianDays
                ? ` Terlama ${formatDays(stage.slowestDays)}.`
                : ""}
            </p>
          </li>
        ))}
      </ul>

      <figcaption className="border-t border-nid-border pt-2 text-xs text-muted-foreground">
        Seluruh angka dalam <strong className="font-medium text-foreground">hari kerja
        Senin–Jumat</strong>, sama dengan cara tenggat CPAR dihitung — sehingga keduanya
        dapat dibandingkan langsung. Hari libur nasional belum diperhitungkan.
      </figcaption>
    </figure>
  );
}
