import { cn } from "@/lib/utils";
import { statusMeta, STATUS_TONE_CLASS, type ClaimStatus } from "@/config/claim-status";

export function StatusBadge({
  status,
  className,
  showHint = false,
}: {
  status: ClaimStatus;
  className?: string;
  showHint?: boolean;
}) {
  const meta = statusMeta(status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        STATUS_TONE_CLASS[meta.tone],
        className,
      )}
      title={showHint ? meta.hint : undefined}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  );
}
