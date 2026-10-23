import {
  CheckCircle2,
  CirclePlus,
  FileCheck2,
  RotateCcw,
  Send,
  type LucideIcon,
} from "lucide-react";

import { formatDateTime } from "@/lib/format";
import { statusMeta, type ClaimStatus } from "@/config/claim-status";
import { cn } from "@/lib/utils";

export interface TimelineEntry {
  readonly id: string;
  readonly action: string;
  readonly actorName: string | null;
  readonly actorJobTitle: string | null;
  readonly fromStatus: ClaimStatus | null;
  readonly toStatus: ClaimStatus | null;
  readonly createdAt: Date;
  readonly comment: string | null;
}

/** Label dan ikon per aksi audit. Aksi yang belum dikenal tetap tampil apa adanya. */
const ACTION_META: Record<string, { label: string; icon: LucideIcon }> = {
  "claim.create": { label: "Draft klaim dibuat", icon: CirclePlus },
  "claim.submit": { label: "Claim information dikirim", icon: Send },
  "claim.review.approve": { label: "Klaim disetujui dan diterbitkan", icon: CheckCircle2 },
  "claim.review.revise": { label: "Revisi diminta", icon: RotateCcw },
  "claim.followUp": { label: "CPAR diterbitkan", icon: FileCheck2 },
  "cpar.section.fill": { label: "Pengisian CPAR dimulai", icon: FileCheck2 },
};

/**
 * Timeline vertikal seluruh peristiwa klaim, dibangun dari AuditLog
 * (§6 Modul 5, kriteria penerimaan #8).
 */
export function ClaimTimeline({ entries }: { entries: readonly TimelineEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Belum ada aktivitas tercatat.</p>;
  }

  return (
    <ol className="relative space-y-5 before:absolute before:bottom-3 before:left-[13px] before:top-3 before:w-px before:bg-nid-border">
      {entries.map((entry) => {
        const meta = ACTION_META[entry.action];
        const Icon = meta?.icon ?? CheckCircle2;
        const tone = entry.toStatus ? statusMeta(entry.toStatus).tone : "draft";

        return (
          <li key={entry.id} className="relative flex gap-3.5">
            <span
              className={cn(
                "z-10 grid size-7 shrink-0 place-items-center rounded-full border-2 border-nid-card",
                tone === "closed" && "bg-[var(--status-closed-bg)] text-[var(--status-closed)]",
                tone === "pending" && "bg-[var(--status-pending-bg)] text-[var(--status-pending)]",
                tone === "published" && "bg-[var(--status-published-bg)] text-[var(--status-published)]",
                tone === "monitoring" && "bg-[var(--status-monitoring-bg)] text-[var(--status-monitoring)]",
                tone === "ignored" && "bg-[var(--status-ignored-bg)] text-[var(--status-ignored)]",
                tone === "draft" && "bg-[var(--status-draft-bg)] text-[var(--status-draft)]",
                tone === "danger" && "bg-[var(--status-danger-bg)] text-[var(--status-danger)]",
              )}
            >
              <Icon aria-hidden className="size-3.5" />
            </span>

            <div className="min-w-0 flex-1 pb-1">
              <p className="text-sm font-medium">{meta?.label ?? entry.action}</p>

              <p className="text-xs text-muted-foreground">
                {entry.actorName ?? "Sistem"}
                {entry.actorJobTitle ? ` · ${entry.actorJobTitle}` : ""}
                {" · "}
                {formatDateTime(entry.createdAt)}
              </p>

              {entry.fromStatus && entry.toStatus ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {statusMeta(entry.fromStatus).label} → {statusMeta(entry.toStatus).label}
                </p>
              ) : null}

              {entry.comment ? (
                <p className="mt-1.5 whitespace-pre-line rounded-md bg-secondary px-3 py-2 text-xs">
                  {entry.comment}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
