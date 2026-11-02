import { PARETO_CUTOFF, percent, type ParetoRow } from "@/lib/dashboard";

/**
 * Pareto non-conformance detail.
 *
 * Diagram Pareto klasik menumpuk garis kumulatif di atas batangnya, dan garis itu
 * menuntut sumbu Y kedua berskala persen. Dua sumbu yang disejajarkan sembarang membuat
 * pembaca melihat hubungan yang tidak ada di datanya — titik potong garis dengan batang
 * sepenuhnya ditentukan oleh pilihan skala, bukan oleh angkanya.
 *
 * Yang dipakai di sini: batang berperingkat satu sumbu, kumulatif dicetak sebagai angka
 * per baris, dan sebab yang bersama-sama mencapai 80% diberi warna aksen sementara
 * sisanya abu. Keputusan yang diambil pembaca sama — mana yang ditangani lebih dulu —
 * tanpa sumbu kedua.
 */
export function ParetoBars({ rows }: { rows: readonly ParetoRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-nid-border px-3 py-6 text-center text-sm text-muted-foreground">
        Belum ada klaim dengan non-conformance detail terisi.
      </p>
    );
  }

  const max = rows[0].count;
  const vitalCount = rows.filter((row) => row.vital).length;

  return (
    <figure className="m-0 space-y-3">
      {/* Dua kelas warna, jadi legenda wajib ada — identitas tidak boleh bergantung
          pada pencocokan warna saja. */}
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 rounded-[2px]"
            style={{ backgroundColor: "var(--nid-orange-600)" }}
          />
          {vitalCount} sebab teratas — {percent(PARETO_CUTOFF)} kasus
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 rounded-[2px]"
            style={{ backgroundColor: "var(--nid-muted)" }}
          />
          sisanya
        </span>
      </figcaption>

      <ol className="space-y-2.5">
        {rows.map((row) => (
          <li key={row.label} className="space-y-1">
            <div className="flex items-baseline gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate" title={row.label}>
                {row.label}
              </span>
              <span className="shrink-0 tabular font-medium">{row.count}</span>
              <span className="w-11 shrink-0 text-right text-xs tabular text-muted-foreground">
                {percent(row.cumulative)}
              </span>
            </div>

            <div className="h-2.5 w-full rounded-[2px] bg-secondary">
              <div
                className="h-full rounded-r-[4px]"
                style={{
                  width: `${(row.count / max) * 100}%`,
                  backgroundColor: row.vital ? "var(--nid-orange-600)" : "var(--nid-muted)",
                }}
                title={`${row.label}: ${row.count} klaim · ${percent(row.share)} dari total · kumulatif ${percent(row.cumulative)}`}
              />
            </div>
          </li>
        ))}
      </ol>

      <p className="text-xs text-muted-foreground">
        Persentase di kanan adalah kumulatif, bukan porsi baris itu sendiri.
      </p>
    </figure>
  );
}
