import { STATUS_TONE_CLASS } from "@/config/claim-status";
import type { CparStatus } from "@/generated/prisma/enums";
import { CPAR_STAGE_LABEL, CPAR_STAGE_TONE } from "@/lib/cpar-stage";
import { cn } from "@/lib/utils";

/**
 * Tahap satu CPAR, bukan status klaimnya.
 *
 * Dibuat terpisah dari `StatusBadge` meski tampilannya sama persis, dan itu disengaja:
 * keduanya mengukur hal yang berbeda sejak satu klaim dapat memiliki beberapa CPAR.
 * Status klaim adalah tahap CPAR yang **paling tertinggal** — jadi pada klaim dengan dua
 * CPAR, badge klaim di kepala halaman akan berbeda dari salah satu badge di bawahnya, dan
 * itu benar. Menyatukan keduanya ke satu komponen akan mengundang pemanggil memakai yang
 * satu di tempat yang lain tanpa ada yang menghalangi.
 */
export function CparStageBadge({ status, className }: { status: CparStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        STATUS_TONE_CLASS[CPAR_STAGE_TONE[status]],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {CPAR_STAGE_LABEL[status]}
    </span>
  );
}
