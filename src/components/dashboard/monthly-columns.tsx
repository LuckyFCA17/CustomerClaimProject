import { axisTicks, type MonthBucket } from "@/lib/dashboard";

/**
 * Jumlah klaim per bulan.
 *
 * Dibangun dari HTML dan CSS, bukan SVG. SVG yang dilebarkan mengikuti kartunya ikut
 * menskalakan teksnya: label sumbu yang pas di layar 1024px menyusut menjadi sekitar
 * 5px di layar ponsel 393px. Batang sebagai elemen biasa membuat tingginya tetap
 * proporsional sementara teksnya tetap berukuran sebenarnya.
 *
 * Satu seri, jadi tanpa kotak legenda — judul kartunya sudah menyebut apa yang diplot.
 */

const PLOT_HEIGHT = 168;

export function MonthlyColumns({ series }: { series: readonly MonthBucket[] }) {
  const max = series.reduce((highest, bucket) => Math.max(highest, bucket.count), 0);
  const ticks = axisTicks(max);
  const top = ticks[ticks.length - 1];
  const busiest = max > 0 ? series.findLastIndex((bucket) => bucket.count === max) : -1;

  return (
    <figure className="m-0 space-y-3">
      <div className="flex gap-2">
        {/* Sumbu Y: tick bulat, menanggung nilai yang tidak diberi label langsung. */}
        <div className="relative shrink-0" style={{ height: PLOT_HEIGHT, width: "2.25rem" }}>
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2 text-[11px] tabular text-muted-foreground"
              style={{ bottom: `${(tick / top) * 100}%` }}
            >
              {tick}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height: PLOT_HEIGHT }}>
            {/* Garis bantu: hairline satu langkah dari permukaan, utuh — bukan putus-putus. */}
            {ticks.map((tick) => (
              <span
                key={tick}
                aria-hidden
                className="absolute inset-x-0 border-t border-nid-border"
                style={{ bottom: `${(tick / top) * 100}%` }}
              />
            ))}

            <ol className="absolute inset-0 flex items-end gap-[2px]">
              {series.map((bucket, index) => (
                <li
                  key={bucket.key}
                  className="relative flex h-full flex-1 items-end justify-center"
                  title={`${bucket.label} ${bucket.year}: ${bucket.count} klaim`}
                >
                  {/* Label langsung hanya pada bulan tertinggi — nilai di tiap batang
                      menjadi kerumunan angka yang justru tidak terbaca. */}
                  {index === busiest ? (
                    <span
                      className="absolute left-1/2 -translate-x-1/2 text-[11px] font-medium tabular"
                      style={{ bottom: `calc(${(bucket.count / top) * 100}% + 4px)` }}
                    >
                      {bucket.count}
                    </span>
                  ) : null}

                  {bucket.count > 0 ? (
                    <span
                      className="w-full max-w-[24px] rounded-t-[4px]"
                      style={{
                        height: `${(bucket.count / top) * 100}%`,
                        backgroundColor: "var(--nid-orange-600)",
                      }}
                    />
                  ) : null}
                </li>
              ))}
            </ol>
          </div>

          <ol className="mt-1.5 flex gap-[2px]">
            {series.map((bucket) => (
              <li
                key={bucket.key}
                className="flex-1 text-center text-[11px] text-muted-foreground"
              >
                {bucket.label}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Padanan tabel: tiap nilai tetap terbaca tanpa bergantung pada warna atau hover. */}
      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          Lihat sebagai tabel
        </summary>
        <table className="mt-2 w-full text-sm">
          <caption className="sr-only">Jumlah klaim per bulan</caption>
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="py-1 font-normal">
                Bulan
              </th>
              <th scope="col" className="py-1 text-right font-normal">
                Klaim
              </th>
            </tr>
          </thead>
          <tbody>
            {series.map((bucket) => (
              <tr key={bucket.key} className="border-t border-nid-border">
                <td className="py-1">
                  {bucket.label} {bucket.year}
                </td>
                <td className="py-1 text-right tabular">{bucket.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
