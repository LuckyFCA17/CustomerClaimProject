import { formatDate, formatWeekday } from "@/lib/format";
import { jakartaDayOfWeek } from "@/lib/dates";
import {
  RESULT_KIND_SHORT,
  type CalendarRow,
  type ResultRow,
  calendarRows,
  resultsOfKind,
  totalResults,
} from "@/lib/monitoring";

/**
 * Rekap angka pemantauan: tabel per tanggal, lalu dua grafik.
 *
 * Komponen server tanpa pustaka grafik — SVG ditulis langsung. Dua sebabnya: aturan
 * proyek hanya mengizinkan shadcn/ui + Tailwind, dan lembar cetak harus memuat gambar
 * yang sama tanpa menunggu JavaScript apa pun berjalan.
 *
 * Tabelnya bukan pelengkap grafik melainkan sumbernya: angka yang tepat dibaca di sana,
 * grafiknya menjawab pertanyaan yang berbeda — apakah NG-nya menurun.
 */
export function MonitoringRecap({ rows }: { rows: readonly ResultRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-nid-border px-3 py-6 text-center text-sm text-muted-foreground">
        Belum ada angka produksi atau inspeksi yang dicatat pada siklus ini.
      </p>
    );
  }

  const days = calendarRows(rows);
  const production = totalResults(resultsOfKind(rows, "PRODUCTION"));
  const inspection = totalResults(resultsOfKind(rows, "INSPECTION"));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryTile kind="PRODUCTION" totals={production} />
        <SummaryTile kind="INSPECTION" totals={inspection} />
      </div>

      <CalendarTable days={days} />

      <div className="space-y-5">
        <NgRateChart days={days} />
        <VolumeChart days={days} />
      </div>
    </div>
  );
}

// ─────────────────────── Warna seri ───────────────────────

/**
 * Dua warna untuk dua seri, dipakai sama persis di tabel, grafik, dan legenda.
 *
 * Biru–jingga lolos pemeriksaan keterbacaan buta warna (ΔE 31,8 pada protanopia, 30,9
 * pada tritanopia) dan keduanya tetap berkontras cukup di atas kartu putih. Identitas
 * seri tidak pernah hanya warna: tiap seri juga punya label langsung pada grafiknya.
 */
const SERIES = {
  PRODUCTION: "#1d4ed8",
  INSPECTION: "#d97428",
} as const;

const INK_MUTED = "#6b7280";
const RULE = "#e4e7eb";

function SummaryTile({
  kind,
  totals,
}: {
  kind: keyof typeof SERIES;
  totals: ReturnType<typeof totalResults>;
}) {
  return (
    <div className="rounded-lg border border-nid-border px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span
          aria-hidden
          className="size-2.5 rounded-[2px]"
          style={{ backgroundColor: SERIES[kind] }}
        />
        {RESULT_KIND_SHORT[kind]}
      </p>
      <p className="mt-1 text-lg font-semibold tabular">
        {totals.ngRate === null ? "—" : `${(totals.ngRate * 100).toFixed(2)}%`}
        <span className="ml-1.5 text-xs font-normal text-muted-foreground">NG</span>
      </p>
      <p className="text-xs tabular text-muted-foreground">
        {totals.ngCount.toLocaleString("id-ID")} NG dari{" "}
        {(totals.okCount + totals.ngCount).toLocaleString("id-ID")} dinilai ·{" "}
        {totals.quantity.toLocaleString("id-ID")} pcs
      </p>
    </div>
  );
}

// ─────────────────────── Tabel kalender ───────────────────────

function CalendarTable({ days }: { days: readonly CalendarRow[] }) {
  const grand = {
    production: sumCells(days.map((day) => day.production)),
    inspection: sumCells(days.map((day) => day.inspection)),
  };

  return (
    <div className="space-y-2">
      {/*
        Keterangannya di luar pembungkus yang menggeser, bukan sebagai <caption>: caption
        mengambil lebar tabelnya, sehingga kalimat ini ikut tergeser ke kanan dan hilang
        dari layar ponsel justru sebelum dibaca.
      */}
      <p className="text-xs text-muted-foreground">
        Hanya tanggal yang punya catatan; baris berlatar abu jatuh pada akhir pekan. Tabelnya
        digeser ke samping untuk membaca kolom inspeksi.
      </p>

      <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th rowSpan={2} className="border-b border-nid-border py-1.5 pr-2 text-left font-medium">
              Tanggal
            </th>
            <th colSpan={3} className="border-b border-l border-nid-border py-1.5 text-center font-medium">
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-2 rounded-[2px]"
                  style={{ backgroundColor: SERIES.PRODUCTION }}
                />
                Produksi
              </span>
            </th>
            <th colSpan={3} className="border-b border-l border-nid-border py-1.5 text-center font-medium">
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-2 rounded-[2px]"
                  style={{ backgroundColor: SERIES.INSPECTION }}
                />
                Inspeksi
              </span>
            </th>
          </tr>
          <tr className="text-muted-foreground">
            <th className="border-b border-l border-nid-border py-1 pr-2 text-right font-normal">Jml</th>
            <th className="border-b border-nid-border py-1 pr-2 text-right font-normal">OK</th>
            <th className="border-b border-nid-border py-1 pr-2 text-right font-normal">NG</th>
            <th className="border-b border-l border-nid-border py-1 pr-2 text-right font-normal">Jml</th>
            <th className="border-b border-nid-border py-1 pr-2 text-right font-normal">OK</th>
            <th className="border-b border-nid-border py-1 pr-2 text-right font-normal">NG</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => {
            const weekend = [0, 6].includes(jakartaDayOfWeek(day.date));

            return (
              <tr
                key={day.day}
                className={`border-b border-nid-border last:border-0 ${weekend ? "bg-secondary/60" : ""}`}
              >
                <td className="py-1.5 pr-2 whitespace-nowrap">
                  <span className="text-muted-foreground">{formatWeekday(day.date)}</span>{" "}
                  <span className="tabular">{formatDate(day.date)}</span>
                </td>
                <Cells totals={day.production} leading />
                <Cells totals={day.inspection} leading />
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-nid-border font-medium">
            <td className="py-1.5 pr-2">Total</td>
            <Cells totals={grand.production} leading />
            <Cells totals={grand.inspection} leading />
          </tr>
        </tfoot>
      </table>
      </div>
    </div>
  );
}

function sumCells(cells: readonly { quantity: number; okCount: number; ngCount: number }[]) {
  return cells.reduce(
    (total, cell) => ({
      quantity: total.quantity + cell.quantity,
      okCount: total.okCount + cell.okCount,
      ngCount: total.ngCount + cell.ngCount,
    }),
    { quantity: 0, okCount: 0, ngCount: 0 },
  );
}

/** Nol yang berarti "tidak ada catatan" ditulis "—", bukan "0". */
function Cells({
  totals,
  leading,
}: {
  totals: { quantity: number; okCount: number; ngCount: number };
  leading?: boolean;
}) {
  const empty = totals.quantity === 0 && totals.okCount === 0 && totals.ngCount === 0;

  return (
    <>
      <td className={`py-1.5 pr-2 text-right tabular ${leading ? "border-l border-nid-border" : ""}`}>
        {empty ? <span className="text-muted-foreground">—</span> : totals.quantity.toLocaleString("id-ID")}
      </td>
      <td className="py-1.5 pr-2 text-right tabular">
        {empty ? <span className="text-muted-foreground">—</span> : totals.okCount.toLocaleString("id-ID")}
      </td>
      <td
        className={`py-1.5 pr-2 text-right tabular ${
          totals.ngCount > 0 ? "font-medium text-[var(--status-danger)]" : ""
        }`}
      >
        {empty ? <span className="text-muted-foreground">—</span> : totals.ngCount.toLocaleString("id-ID")}
      </td>
    </>
  );
}

// ─────────────────────── Grafik ───────────────────────

const WIDTH = 320;
const HEIGHT = 112;
const PAD = { top: 10, right: 6, bottom: 18, left: 28 } as const;
const PLOT = {
  width: WIDTH - PAD.left - PAD.right,
  height: HEIGHT - PAD.top - PAD.bottom,
} as const;

/**
 * Jarak tepi yang tidak pernah dipakai titik mana pun.
 *
 * Batang tanggal pertama digambar di kiri titiknya; tanpa jarak ini ia menimpa label
 * sumbu-Y, dan batang tanggal terakhir keluar dari viewBox. Lebarnya sedikit lebih besar
 * daripada batang terlebar supaya keduanya selalu muat.
 */
const EDGE_INSET = 11;

/** Posisi mendatar satu tanggal, berdasarkan jaraknya yang sebenarnya — jeda ikut terlihat. */
function xScale(days: readonly CalendarRow[]) {
  const first = days[0]?.dayNumber ?? 0;
  const last = days[days.length - 1]?.dayNumber ?? first;
  const span = last - first;
  const usable = PLOT.width - EDGE_INSET * 2;

  return (dayNumber: number) =>
    span === 0
      ? PAD.left + PLOT.width / 2
      : PAD.left + EDGE_INSET + ((dayNumber - first) / span) * usable;
}

function yScale(max: number) {
  return (value: number) => PAD.top + PLOT.height - (value / max) * PLOT.height;
}

/** Tanggal pertama, tengah, dan terakhir saja — label pada tiap titik akan bertabrakan. */
function axisDays(days: readonly CalendarRow[]): readonly CalendarRow[] {
  if (days.length <= 2) return days;

  const middle = days[Math.floor(days.length / 2)];

  return [days[0], middle, days[days.length - 1]].filter(
    (day, index, list): day is CalendarRow => Boolean(day) && list.indexOf(day) === index,
  );
}

function ChartFrame({
  title,
  hint,
  children,
  axis,
  x,
  gridLabels,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
  axis: readonly CalendarRow[];
  /** Skala yang sama dengan isi grafiknya; label sumbu tidak menghitungnya sendiri. */
  x: (dayNumber: number) => number;
  gridLabels: readonly { y: number; label: string }[];
}) {
  return (
    <figure className="m-0 space-y-1.5">
      <figcaption className="space-y-0.5">
        <h5 className="text-sm font-medium">{title}</h5>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </figcaption>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`${title}. Angka tepatnya ada pada tabel di atas.`}
      >
        {gridLabels.map((line) => (
          <g key={line.label}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={line.y}
              y2={line.y}
              stroke={RULE}
              strokeWidth={1}
            />
            <text
              x={PAD.left - 4}
              y={line.y + 3}
              textAnchor="end"
              fontSize={7.5}
              fill={INK_MUTED}
            >
              {line.label}
            </text>
          </g>
        ))}

        {children}

        {axis.map((day) => (
          <text
            key={day.day}
            x={x(day.dayNumber)}
            y={HEIGHT - 5}
            textAnchor="middle"
            fontSize={7.5}
            fill={INK_MUTED}
          >
            {formatDate(day.date).slice(0, 6)}
          </text>
        ))}
      </svg>
    </figure>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {(["PRODUCTION", "INSPECTION"] as const).map((kind) => (
        <li key={kind} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 rounded-[2px]"
            style={{ backgroundColor: SERIES[kind] }}
          />
          {RESULT_KIND_SHORT[kind]}
        </li>
      ))}
    </ul>
  );
}

/**
 * Bagian NG terhadap waktu — pertanyaan yang sebenarnya dijawab pemantauan.
 *
 * Sumbunya satu, hanya persen. Jumlah pcs punya grafiknya sendiri di bawah: dua skala
 * pada satu sumbu akan membuat garis yang turun tampak naik tergantung mana yang
 * kebetulan dipasang di kiri.
 */
function NgRateChart({ days }: { days: readonly CalendarRow[] }) {
  const rates = days.flatMap((day) =>
    [day.production.ngRate, day.inspection.ngRate].filter((rate): rate is number => rate !== null),
  );

  if (rates.length === 0) {
    return null;
  }

  // Lantai 2% supaya deretan nol — hasil yang justru diharapkan — tidak menempel di
  // sumbu tanpa ruang sedikit pun di atasnya.
  const max = Math.max(0.02, Math.max(...rates) * 1.25);
  const x = xScale(days);
  const y = yScale(max);
  const axis = axisDays(days);

  const gridLabels = [0, 0.5, 1].map((fraction) => ({
    y: y(max * fraction),
    label: `${(max * fraction * 100).toFixed(max < 0.05 ? 1 : 0)}%`,
  }));

  return (
    <div className="space-y-1.5">
      <ChartFrame
        title="Bagian NG per tanggal"
        hint="Dihitung dari yang sudah dinilai (OK + NG), bukan dari jumlah yang diproduksi."
        axis={axis}
        x={x}
        gridLabels={gridLabels}
      >
        {(["PRODUCTION", "INSPECTION"] as const).map((kind) => {
          const points = days
            .map((day) => ({
              day,
              rate: kind === "PRODUCTION" ? day.production.ngRate : day.inspection.ngRate,
            }))
            .filter((point): point is { day: CalendarRow; rate: number } => point.rate !== null);

          if (points.length === 0) return null;

          const path = points
            .map((point, index) => `${index === 0 ? "M" : "L"}${x(point.day.dayNumber)} ${y(point.rate)}`)
            .join(" ");

          return (
            <g key={kind}>
              {points.length > 1 ? (
                <path
                  d={path}
                  fill="none"
                  stroke={SERIES[kind]}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}

              {points.map((point) => (
                <circle
                  key={point.day.day}
                  cx={x(point.day.dayNumber)}
                  cy={y(point.rate)}
                  r={4}
                  fill={SERIES[kind]}
                  stroke="#ffffff"
                  strokeWidth={2}
                >
                  <title>
                    {`${RESULT_KIND_SHORT[kind]} · ${formatDate(point.day.date)} · ${(point.rate * 100).toFixed(2)}% NG`}
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
      </ChartFrame>

      <Legend />
    </div>
  );
}

/** Jumlah pcs per tanggal — konteks bagi grafik di atas: 1 NG dari 10 bukan 1 dari 10.000. */
function VolumeChart({ days }: { days: readonly CalendarRow[] }) {
  const max = Math.max(
    1,
    ...days.flatMap((day) => [day.production.quantity, day.inspection.quantity]),
  );

  const x = xScale(days);
  const y = yScale(max);
  const axis = axisDays(days);

  // Dua batang per tanggal dengan jarak 2px di antaranya; menyempit sendiri saat
  // tanggalnya banyak, dan tidak pernah lebih lebar dari yang enak dibaca.
  const slot = days.length > 1 ? (PLOT.width - EDGE_INSET * 2) / (days.length - 1) : PLOT.width / 2;
  const barWidth = Math.max(2, Math.min(9, slot / 2 - 1));

  const gridLabels = [0, 0.5, 1].map((fraction) => ({
    y: y(max * fraction),
    label: compact(max * fraction),
  }));

  return (
    <div className="space-y-1.5">
      <ChartFrame
        title="Jumlah per tanggal"
        hint="Batang kiri produksi, kanan inspeksi. Jarak antar batang mengikuti jarak tanggalnya."
        axis={axis}
        x={x}
        gridLabels={gridLabels}
      >
        {days.map((day) =>
          (["PRODUCTION", "INSPECTION"] as const).map((kind, index) => {
            const totals = kind === "PRODUCTION" ? day.production : day.inspection;
            if (totals.quantity === 0) return null;

            const left = x(day.dayNumber) + (index === 0 ? -barWidth - 1 : 1);
            const top = y(totals.quantity);
            const height = PAD.top + PLOT.height - top;

            return (
              <path
                key={`${day.day}-${kind}`}
                d={barPath(left, top, barWidth, height, Math.min(2, barWidth / 2))}
                fill={SERIES[kind]}
              >
                <title>
                  {`${RESULT_KIND_SHORT[kind]} · ${formatDate(day.date)} · ${totals.quantity.toLocaleString("id-ID")} pcs, NG ${totals.ngCount.toLocaleString("id-ID")}`}
                </title>
              </path>
            );
          }),
        )}
      </ChartFrame>

      <Legend />
    </div>
  );
}

/** Batang dengan ujung atas membulat dan alas rata — alasnya menempel di garis nol. */
function barPath(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.min(radius, height);

  return [
    `M${x} ${y + height}`,
    `V${y + r}`,
    `Q${x} ${y} ${x + r} ${y}`,
    `H${x + width - r}`,
    `Q${x + width} ${y} ${x + width} ${y + r}`,
    `V${y + height}`,
    "Z",
  ].join(" ");
}

function compact(value: number): string {
  if (value >= 1000) return `${Math.round(value / 100) / 10}k`;

  return String(Math.round(value));
}
