import { CLAIM_TYPE_HINT, UNTYPED, type TypeRow, type TypeRowKey, totalOf } from "@/lib/analytics";
import { percent } from "@/lib/dashboard";

/**
 * Jumlah klaim per jenis.
 *
 * Batang mendatar, bukan satu batang bertumpuk: pertanyaannya "berapa banyak tiap
 * jenis", dan membandingkan panjang dari garis awal yang sama jauh lebih mudah daripada
 * membandingkan potongan yang titik awalnya berbeda-beda. Porsinya tetap tertulis
 * sebagai angka, jadi yang hilang dari batang bertumpuk tidak ada.
 *
 * Warnanya biru–jingga–magenta, pasangan yang lolos pemeriksaan keterbacaan buta warna
 * pada seluruh pasangan sekaligus — bukan hanya pasangan bersebelahan. Biru dan magenta
 * berdekatan pada protanopia (ΔE 7,4), dan itu sebabnya **tiap batang diberi label
 * namanya sendiri**: identitas tidak pernah bergantung pada warna saja.
 */
const SERIES: Record<TypeRowKey, string> = {
  OFFICIAL: "#1d4ed8",
  NON_OFFICIAL: "#d97428",
  INFORMATION_ONLY: "#a21caf",
  // Ketiadaan, bukan kategori — jadi abu, dan tidak ikut dihitung dalam pemeriksaan
  // keterbacaan warna di atas.
  [UNTYPED]: "var(--nid-muted)",
};

const HINT: Record<TypeRowKey, string> = {
  ...CLAIM_TYPE_HINT,
  [UNTYPED]: "Draft yang jenis klaimnya belum ditentukan.",
};

export function ClaimTypeBars({ rows }: { rows: readonly TypeRow[] }) {
  const total = totalOf(rows);

  if (total === 0) {
    return (
      <p className="rounded-lg border border-dashed border-nid-border px-3 py-6 text-center text-sm text-muted-foreground">
        Belum ada klaim pada periode ini.
      </p>
    );
  }

  // Skala dibuat terhadap jenis terbanyak, bukan terhadap total: dengan tiga jenis,
  // skala-terhadap-total membuat seluruh batang pendek dan selisihnya tidak terbaca.
  const max = rows.reduce((highest, row) => Math.max(highest, row.count), 0);

  return (
    <figure className="m-0 space-y-3">
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.type}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="flex items-center gap-2 text-sm font-medium">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: SERIES[row.type] }}
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
                  width: max === 0 ? "0%" : `${Math.max(row.count === 0 ? 0 : 2, (row.count / max) * 100)}%`,
                  backgroundColor: SERIES[row.type],
                }}
              />
            </div>

            <p className="mt-1 text-xs text-muted-foreground">{HINT[row.type]}</p>
          </li>
        ))}
      </ul>

      <figcaption className="border-t border-nid-border pt-2 text-xs tabular text-muted-foreground">
        Total {total} klaim pada periode ini.
      </figcaption>
    </figure>
  );
}
