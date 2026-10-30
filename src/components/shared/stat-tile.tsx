import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Satu angka utama pada baris KPI.
 *
 * Sengaja bukan diagram: beberapa angka utama terbaca lebih cepat sebagai deretan
 * kartu daripada sebagai batang yang harus dibandingkan panjangnya.
 *
 * Angkanya memakai figur proporsional, bukan `tabular-nums` yang dipakai tabel di
 * portal ini — pada ukuran besar, digit selebar nol membuat angka seperti 121 tampak
 * renggang. Tabular tetap dipakai di kolom tabel, tempat digit memang harus sejajar.
 */

export type StatTone = "neutral" | "good" | "warning" | "critical";

const TONE: Record<StatTone, { value: string; icon: string; chip: string }> = {
  neutral: {
    value: "text-foreground",
    icon: "text-muted-foreground",
    chip: "bg-secondary text-muted-foreground",
  },
  good: {
    value: "text-[var(--status-closed)]",
    icon: "text-[var(--status-closed)]",
    chip: "bg-[var(--status-closed-bg)] text-[var(--status-closed)]",
  },
  warning: {
    value: "text-[var(--status-pending)]",
    icon: "text-[var(--status-pending)]",
    chip: "bg-[var(--status-pending-bg)] text-[var(--status-pending)]",
  },
  critical: {
    value: "text-[var(--status-danger)]",
    icon: "text-[var(--status-danger)]",
    chip: "bg-[var(--status-danger-bg)] text-[var(--status-danger)]",
  },
};

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
}: {
  /** Kalimat biasa, tanpa titik dua di akhir. */
  readonly label: string;
  readonly value: number | string;
  readonly hint?: string;
  readonly icon: LucideIcon;
  readonly tone?: StatTone;
}) {
  const palette = TONE[tone];

  return (
    <div className="rounded-xl border border-nid-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        {/* Warna status tidak pernah berdiri sendiri: ikon dan label menyertainya,
            supaya artinya tetap terbaca tanpa membedakan warna. */}
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", palette.chip)}>
          <Icon aria-hidden className="size-4" />
        </span>
      </div>

      <div className={cn("mt-2 font-display text-3xl font-semibold leading-none", palette.value)}>
        {value}
      </div>

      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Baris KPI; membungkus ke bawah pada layar ponsel. */
export function StatRow({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

export interface ProgressSegment {
  readonly count: number;
  readonly tone: Exclude<StatTone, "neutral">;
  readonly label: string;
}

/**
 * Batang tipis satu keseluruhan yang terbagi (periode efektif / menunggu / gagal).
 *
 * Tanpa teks di dalamnya: angka-angkanya sudah tertulis di baris yang sama, dan
 * mencetaknya lagi di atas batang tidak menambah apa pun. Bagian bernilai nol tidak
 * menggambar apa-apa.
 */
export function SegmentedBar({ segments }: { segments: readonly ProgressSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);

  if (total === 0) {
    return <div className="h-1.5 w-full rounded-full bg-secondary" aria-hidden />;
  }

  const color: Record<Exclude<StatTone, "neutral">, string> = {
    good: "var(--status-closed)",
    warning: "var(--status-pending)",
    critical: "var(--status-danger)",
  };

  return (
    <div
      className="flex h-1.5 w-full gap-[2px] overflow-hidden rounded-full"
      role="img"
      aria-label={segments
        .filter((segment) => segment.count > 0)
        .map((segment) => `${segment.count} ${segment.label}`)
        .join(", ")}
    >
      {segments
        .filter((segment) => segment.count > 0)
        .map((segment) => (
          <span
            key={segment.tone}
            className="rounded-full"
            style={{
              width: `${(segment.count / total) * 100}%`,
              backgroundColor: color[segment.tone],
            }}
          />
        ))}
    </div>
  );
}
