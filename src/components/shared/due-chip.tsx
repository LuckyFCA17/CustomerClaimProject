import { CalendarClock, TriangleAlert } from "lucide-react";

import { formatDate } from "@/lib/format";
import { dueWarning } from "@/lib/due-date";

const TONE_CLASS = {
  danger: "bg-[var(--status-danger-bg)] text-[var(--status-danger)]",
  pending: "bg-[var(--status-pending-bg)] text-[var(--status-pending)]",
} as const;

/**
 * Tanggal tenggat beserta peringatannya, untuk baris tabel klaim dan CPAR.
 *
 * Tanggalnya selalu dicetak; chip peringatannya hanya muncul saat tenggatnya mendekat,
 * jatuh hari ini, atau sudah lewat. Tanggal tanpa konteks tidak memberi tahu apa pun —
 * pembaca harus menghitung sendiri terhadap hari ini, dan pada daftar berisi dua puluh
 * baris tidak ada yang melakukannya.
 */
export function DueChip({
  dueDate,
  now,
  settled = false,
  className,
}: {
  dueDate: Date | null | undefined;
  now: Date;
  /** Pekerjaannya sudah dikirim atau ditutup; tenggat yang sudah dipenuhi tidak diperingatkan. */
  settled?: boolean;
  className?: string;
}) {
  if (!dueDate) return null;

  const warning = dueWarning(dueDate, now, settled);

  return (
    <span className={`flex items-center gap-1 text-xs tabular text-muted-foreground ${className ?? ""}`}>
      <CalendarClock aria-hidden className="size-3.5" />
      {formatDate(dueDate)}

      {warning ? (
        <span
          title={warning.hint}
          className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium ${TONE_CLASS[warning.tone]}`}
        >
          {warning.tone === "danger" ? <TriangleAlert aria-hidden className="size-3" /> : null}
          {warning.label}
        </span>
      ) : null}
    </span>
  );
}
