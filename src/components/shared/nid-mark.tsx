import { cn } from "@/lib/utils";

/**
 * Wordmark portal. Sengaja berbasis teks, bukan file gambar — logo resmi NIFCO
 * belum tersedia di repo dan kop PDF (§9) memakai mark yang sama.
 */
export function NidMark({
  compact = false,
  tone = "onOrange",
  className,
}: {
  compact?: boolean;
  tone?: "onOrange" | "onLight";
  className?: string;
}) {
  const onOrange = tone === "onOrange";

  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg font-display text-sm font-bold",
          onOrange ? "bg-white/15 text-white ring-1 ring-white/25" : "bg-nid-orange-600 text-white",
        )}
      >
        NC
      </span>

      {compact ? null : (
        <span className="flex flex-col leading-tight">
          <span
            className={cn(
              "font-display text-sm font-bold tracking-wide",
              onOrange ? "text-white" : "text-nid-orange-700",
            )}
          >
            NCC Portal
          </span>
          <span className={cn("text-[11px]", onOrange ? "text-white/75" : "text-muted-foreground")}>
            NIFCO Customer Claim
          </span>
        </span>
      )}
    </span>
  );
}
