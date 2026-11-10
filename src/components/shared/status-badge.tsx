import { cn } from "@/lib/utils";
import {
  CLOSURE_META,
  STATUS_TONE_CLASS,
  statusMeta,
  type ClaimStatus,
  type ClosureTiming,
} from "@/config/claim-status";

export function StatusBadge({
  status,
  closure,
  className,
  showHint = false,
}: {
  status: ClaimStatus;
  /**
   * Ketepatan waktu penutupan, bila pemanggilnya mengetahuinya.
   *
   * Hanya berlaku pada `VERIFIED_CLOSED`: badge-nya berubah menjadi "Closed under due
   * date" atau "Closed overdue date". Opsional dan abai pada status lain, sehingga
   * halaman yang tidak memuat tanggal tutup dan tenggatnya tetap memakai badge biasa
   * alih-alih menebak salah satu dari keduanya.
   */
  closure?: ClosureTiming | null;
  className?: string;
  showHint?: boolean;
}) {
  const meta = statusMeta(status);
  const timing = status === "VERIFIED_CLOSED" && closure ? CLOSURE_META[closure] : null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        STATUS_TONE_CLASS[timing?.tone ?? meta.tone],
        className,
      )}
      title={showHint ? (timing?.hint ?? meta.hint) : undefined}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {timing?.label ?? meta.label}
    </span>
  );
}
