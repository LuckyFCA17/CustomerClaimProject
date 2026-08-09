import { Check, RotateCcw, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { RAIL_STAGES, statusMeta, type ClaimStatus } from "@/config/claim-status";

/**
 * Status rail — elemen tanda tangan portal (§10).
 *
 * Pita horizontal berisi seluruh tahap klaim: tahap terlewati terisi oranye, tahap aktif
 * berdenyut halus, dan tahap yang kembali karena revisi ditandai garis balik. Ini satu-satunya
 * tempat animasi di portal; denyutnya mati otomatis saat `prefers-reduced-motion: reduce`.
 */
export function StatusRail({
  status,
  cycle,
  className,
}: {
  status: ClaimStatus;
  /** Siklus CPAR berjalan; ditampilkan pada garis balik bila > 1. */
  cycle?: number;
  className?: string;
}) {
  const meta = statusMeta(status);
  const isStopped = Boolean(meta.terminal) && status === "IGNORED";

  return (
    <div className={cn("overflow-x-auto", className)}>
      <ol
        aria-label="Claim progress"
        className="flex min-w-[640px] items-start gap-0 px-1 py-2 sm:min-w-0"
      >
        {/*
         * Pada klaim IGNORED, tahap sampai Published tetap terisi — klaim memang sempat terbit.
         * Tanda berhenti jatuh pada tahap sesudahnya, yaitu tahap yang tidak pernah dijalankan.
         */}
        {RAIL_STAGES.map((stage, index) => {
          const stoppedIndex = isStopped ? meta.stage + 1 : -1;
          const isDone = isStopped
            ? index <= meta.stage
            : index < meta.stage || (Boolean(meta.terminal) && index === meta.stage);
          const isActive = !isStopped && index === meta.stage && !isDone;
          const isSkipped = isStopped && index > stoppedIndex;

          return (
            <li
              key={stage}
              aria-current={isActive ? "step" : undefined}
              className="flex flex-1 flex-col items-center gap-2"
            >
              <div className="flex w-full items-center">
                <Connector
                  hidden={index === 0}
                  filled={isDone || isActive}
                  dashed={Boolean(meta.reverted) && isActive}
                />
                <StageDot
                  done={isDone}
                  active={isActive}
                  skipped={isSkipped}
                  stopped={index === stoppedIndex}
                  reverted={Boolean(meta.reverted) && isActive}
                />
                <Connector hidden={index === RAIL_STAGES.length - 1} filled={isDone} />
              </div>

              <span
                className={cn(
                  "text-center text-[11px] font-medium leading-tight",
                  isActive && "text-nid-orange-700",
                  isDone && "text-foreground",
                  (isSkipped || (!isActive && !isDone)) && "text-muted-foreground",
                )}
              >
                {stage}
              </span>
            </li>
          );
        })}
      </ol>

      {meta.reverted ? (
        <p className="mt-1 flex items-center gap-1.5 px-1 text-xs text-[var(--status-pending)]">
          <RotateCcw aria-hidden className="size-3.5" />
          Dikembalikan untuk revisi{typeof cycle === "number" && cycle > 1 ? ` — siklus ${cycle}` : ""}.
        </p>
      ) : null}

      {isStopped ? (
        <p className="mt-1 px-1 text-xs text-[var(--status-ignored)]">
          Klaim ditutup sebagai <span className="font-medium">Ignored</span>; tahap berikutnya tidak dijalankan.
        </p>
      ) : null}
    </div>
  );
}

function Connector({
  hidden,
  filled,
  dashed = false,
}: {
  hidden: boolean;
  filled: boolean;
  dashed?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "h-0.5 flex-1",
        hidden && "invisible",
        dashed
          ? "bg-[repeating-linear-gradient(90deg,var(--status-pending)_0_6px,transparent_6px_12px)]"
          : filled
            ? "bg-nid-orange-500"
            : "bg-nid-border",
      )}
    />
  );
}

function StageDot({
  done,
  active,
  skipped,
  stopped,
  reverted,
}: {
  done: boolean;
  active: boolean;
  skipped: boolean;
  stopped: boolean;
  reverted: boolean;
}) {
  if (stopped) {
    return (
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--status-ignored)] text-white">
        <X aria-hidden className="size-4" />
      </span>
    );
  }

  if (done) {
    return (
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-nid-orange-500 text-white">
        <Check aria-hidden className="size-4" />
      </span>
    );
  }

  if (active) {
    return (
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full border-2 bg-card",
          reverted
            ? "border-[var(--status-pending)] text-[var(--status-pending)]"
            : "border-nid-orange-600 text-nid-orange-700 nid-pulse",
        )}
      >
        {reverted ? (
          <RotateCcw aria-hidden className="size-3.5" />
        ) : (
          <span aria-hidden className="size-2 rounded-full bg-nid-orange-600" />
        )}
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "size-7 shrink-0 rounded-full border-2 border-nid-border bg-card",
        skipped && "opacity-50",
      )}
    />
  );
}
