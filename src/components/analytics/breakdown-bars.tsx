import { percent } from "@/lib/dashboard";
import { type BreakdownRow, totalOf } from "@/lib/analytics";

/**
 * Grafik rincian bernilai tetap — jenis klaim, pengulangan kejadian, dan sejenisnya.
 *
 * Batang mendatar, bukan satu batang bertumpuk: pertanyaannya "berapa banyak tiap
 * nilai", dan membandingkan panjang dari garis awal yang sama jauh lebih mudah daripada
 * membandingkan potongan yang titik awalnya berbeda-beda. Porsinya tetap tertulis
 * sebagai angka, jadi yang hilang dari batang bertumpuk tidak ada.
 *
 * Tiap batang diberi label namanya sendiri — identitas tidak pernah bergantung pada
 * warna saja, berapa pun jauhnya warna-warna itu dipisahkan.
 */
export function BreakdownBars({
  rows,
  empty,
  caption,
}: {
  rows: readonly BreakdownRow[];
  empty: string;
  caption?: string;
}) {
  const total = totalOf(rows);

  if (total === 0) {
    return (
      <p className="rounded-lg border border-dashed border-nid-border px-3 py-6 text-center text-sm text-muted-foreground">
        {empty}
      </p>
    );
  }

  // Skala terhadap nilai terbanyak, bukan terhadap total: dengan tiga nilai,
  // skala-terhadap-total membuat seluruh batang pendek dan selisihnya tidak terbaca.
  const max = rows.reduce((highest, row) => Math.max(highest, row.count), 0);

  return (
    <figure className="m-0 space-y-3">
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.key}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="flex items-center gap-2 text-sm font-medium">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: row.color }}
                />
                {row.label}
              </span>
              <span className="text-sm tabular text-muted-foreground">
                <strong className="font-semibold text-foreground">{row.count}</strong> ·{" "}
                {percent(row.share)}
              </span>
            </div>

            <div
              className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-secondary"
              role="img"
              aria-label={`${row.label}: ${row.count} klaim, ${percent(row.share)} dari total`}
            >
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${max === 0 || row.count === 0 ? 0 : Math.max(2, (row.count / max) * 100)}%`,
                  backgroundColor: row.color,
                }}
              />
            </div>

            <p className="mt-1 text-xs text-muted-foreground">{row.hint}</p>
          </li>
        ))}
      </ul>

      <figcaption className="border-t border-nid-border pt-2 text-xs tabular text-muted-foreground">
        {caption ?? `Total ${total} klaim pada periode ini.`}
      </figcaption>
    </figure>
  );
}
