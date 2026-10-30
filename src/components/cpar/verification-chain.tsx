import { CheckCircle2, CircleDashed, RotateCcw } from "lucide-react";

import type { RoleCode } from "@/generated/prisma/enums";
import { SECTION_LABEL, VERIFIER_CAPACITY_LABEL } from "@/lib/cpar";
import type { CparSectionKey } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/format";

export interface VerificationView {
  readonly id: string;
  readonly role: RoleCode;
  readonly decision: "VERIFIED" | "REVISE";
  readonly comment: string | null;
  readonly targetSections: readonly CparSectionKey[];
  readonly cycle: number;
  readonly decidedAt: Date;
  readonly verifierName: string;
  readonly verifierJobTitle: string;
}

/**
 * Rantai verifikasi siklus berjalan (§5).
 *
 * Empat kapasitas selalu dicetak, termasuk yang belum memutuskan — daftar yang hanya
 * memuat keputusan yang sudah masuk tidak menjawab pertanyaan yang paling sering
 * ditanyakan di sini, yaitu "siapa lagi yang kita tunggu?".
 */
export function VerificationChain({
  required,
  verifications,
  cycle,
}: {
  required: readonly RoleCode[];
  verifications: readonly VerificationView[];
  cycle: number;
}) {
  const thisCycle = verifications.filter((entry) => entry.cycle === cycle);

  return (
    <ol className="divide-y divide-nid-border">
      {required.map((role) => {
        const decision = thisCycle.find((entry) => entry.role === role);

        return (
          <li key={role} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-3 first:pt-0">
            <DecisionIcon decision={decision?.decision ?? null} />

            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{VERIFIER_CAPACITY_LABEL[role] ?? role}</div>

              {decision ? (
                <>
                  <div className="text-xs text-muted-foreground">
                    {decision.verifierName} · {decision.verifierJobTitle} ·{" "}
                    {formatDateTime(decision.decidedAt)}
                  </div>
                  {decision.comment ? (
                    <p className="mt-1 whitespace-pre-line break-words text-sm">
                      {decision.comment}
                    </p>
                  ) : null}
                  {decision.targetSections.length > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Ditandai: {decision.targetSections.map((key) => SECTION_LABEL[key]).join(", ")}
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="text-xs text-muted-foreground">Belum memutuskan</div>
              )}
            </div>

            {decision ? (
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={
                  decision.decision === "VERIFIED"
                    ? { backgroundColor: "var(--status-closed-bg)", color: "var(--status-closed)" }
                    : { backgroundColor: "var(--status-danger-bg)", color: "var(--status-danger)" }
                }
              >
                {decision.decision === "VERIFIED" ? "Verified" : "Needs revision"}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function DecisionIcon({ decision }: { decision: "VERIFIED" | "REVISE" | null }) {
  if (decision === "VERIFIED") {
    return <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--status-closed)]" />;
  }

  if (decision === "REVISE") {
    return <RotateCcw aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--status-danger)]" />;
  }

  return <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />;
}

/**
 * Keputusan siklus-siklus sebelumnya.
 *
 * Tidak pernah dihapus (PLAN D4): satu CPAR yang disetujui pada siklus ketiga harus
 * tetap memperlihatkan mengapa siklus pertama dan kedua dikembalikan.
 */
export function VerificationHistory({
  verifications,
  cycle,
}: {
  verifications: readonly VerificationView[];
  cycle: number;
}) {
  const earlier = verifications
    .filter((entry) => entry.cycle < cycle)
    .sort((a, b) => b.cycle - a.cycle || b.decidedAt.getTime() - a.decidedAt.getTime());

  if (earlier.length === 0) {
    return <p className="text-sm text-muted-foreground">Belum ada siklus sebelumnya.</p>;
  }

  return (
    <ol className="space-y-3">
      {earlier.map((entry) => (
        <li key={entry.id} className="rounded-lg border border-nid-border px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="rounded-full bg-secondary px-2 py-0.5 font-medium tabular text-foreground">
              Siklus {entry.cycle}
            </span>
            <span>{VERIFIER_CAPACITY_LABEL[entry.role] ?? entry.role}</span>
            <span>·</span>
            <span>{entry.verifierName}</span>
            <span>·</span>
            <span>{formatDateTime(entry.decidedAt)}</span>
            <span
              className="ml-auto rounded-full px-2 py-0.5 font-medium"
              style={
                entry.decision === "VERIFIED"
                  ? { backgroundColor: "var(--status-closed-bg)", color: "var(--status-closed)" }
                  : { backgroundColor: "var(--status-danger-bg)", color: "var(--status-danger)" }
              }
            >
              {entry.decision === "VERIFIED" ? "Verified" : "Needs revision"}
            </span>
          </div>

          {entry.comment ? (
            <p className="mt-1.5 whitespace-pre-line break-words text-sm">{entry.comment}</p>
          ) : null}

          {entry.targetSections.length > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Ditandai: {entry.targetSections.map((key) => SECTION_LABEL[key]).join(", ")}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
