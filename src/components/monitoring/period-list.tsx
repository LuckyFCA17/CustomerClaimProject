"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  FileUp,
  Loader2,
  Trash2,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { MonitoringStatus } from "@/generated/prisma/enums";
import { MONITORING_STATUS_LABEL } from "@/lib/monitoring";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  deleteMonitoringEvidence,
  setEffectiveness,
  uploadMonitoringEvidence,
} from "@/server/actions/monitoring";

export interface PeriodEvidence {
  readonly id: string;
  readonly originalName: string;
  readonly url: string;
  readonly uploadedByName: string;
  readonly uploadedAt: Date;
}

export interface PeriodView {
  readonly id: string;
  readonly periodNo: number;
  readonly dueDate: Date;
  readonly status: MonitoringStatus;
  readonly note: string | null;
  readonly filledByName: string | null;
  readonly filledAt: Date | null;
  readonly evidence: readonly PeriodEvidence[];
}

/**
 * Periode pemantauan beserta evidence dan penilaiannya (§6 Modul 4).
 *
 * Penilaian dan pengumpulan bukti sengaja berada pada kartu yang sama: Factory Manager
 * yang menilai perlu melihat berkas yang menjadi dasarnya tanpa berpindah halaman.
 */
export function PeriodList({
  periods,
  canUpload,
  canAssess,
}: {
  periods: readonly PeriodView[];
  canUpload: boolean;
  canAssess: boolean;
}) {
  if (periods.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-nid-border px-3 py-6 text-center text-sm text-muted-foreground">
        Belum ada periode pemantauan pada siklus ini.
      </p>
    );
  }

  return (
    <ol className="space-y-4">
      {periods.map((period) => (
        <li key={period.id}>
          <PeriodCard period={period} canUpload={canUpload} canAssess={canAssess} />
        </li>
      ))}
    </ol>
  );
}

const TONE: Record<MonitoringStatus, { bg: string; fg: string }> = {
  PENDING: { bg: "var(--status-draft-bg)", fg: "var(--status-draft)" },
  EFFECTIVE: { bg: "var(--status-closed-bg)", fg: "var(--status-closed)" },
  NOT_EFFECTIVE: { bg: "var(--status-danger-bg)", fg: "var(--status-danger)" },
};

function PeriodCard({
  period,
  canUpload,
  canAssess,
}: {
  period: PeriodView;
  canUpload: boolean;
  canAssess: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [isDeleting, startDelete] = useTransition();
  const [note, setNote] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<MonitoringStatus | null>(null);

  const pending = period.status === "PENDING";
  const overdue = pending && period.dueDate < new Date();
  const tone = TONE[period.status];

  async function upload(file: File) {
    setUploading(true);

    try {
      const formData = new FormData();
      formData.set("periodId", period.id);
      formData.set("file", file);

      const result = await uploadMonitoringEvidence(formData);

      if (!result.ok) {
        toast.error("Unggah evidence gagal", { description: result.message });
        return;
      }

      router.refresh();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function assess(result: "EFFECTIVE" | "NOT_EFFECTIVE") {
    setError(null);
    setDeciding(result);

    try {
      const outcome = await setEffectiveness(period.id, { result, note });

      if (!outcome.ok) {
        setError(outcome.fieldErrors?.note?.[0] ?? outcome.message ?? "Penilaian gagal disimpan.");
        toast.error("Penilaian gagal", { description: outcome.message });
        return;
      }

      toast.success(
        result === "EFFECTIVE" ? "Periode dinyatakan Effective" : "Periode Not Effective",
        { description: outcome.message },
      );
      router.refresh();
    } finally {
      setDeciding(null);
    }
  }

  return (
    <article className="rounded-lg border border-nid-border bg-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-nid-border px-4 py-3">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold tabular">
          {period.periodNo}
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="font-medium">Periode {period.periodNo}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock aria-hidden className="size-3.5" />
            Tenggat {formatDate(period.dueDate)}
            {overdue ? (
              <span className="rounded-full bg-[var(--status-danger-bg)] px-1.5 py-0.5 font-medium text-[var(--status-danger)]">
                lewat tenggat
              </span>
            ) : null}
          </p>
        </div>

        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ backgroundColor: tone.bg, color: tone.fg }}
        >
          {MONITORING_STATUS_LABEL[period.status]}
        </span>
      </header>

      <div className="space-y-4 px-4 py-3">
        <div className="space-y-2">
          <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Evidence</h4>

          {period.evidence.length > 0 ? (
            <ul className="divide-y divide-nid-border rounded-lg border border-nid-border">
              {period.evidence.map((file) => (
                <li key={file.id} className="flex items-center gap-3 px-3 py-2">
                  <FileUp aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener"
                      className="block truncate text-sm text-nid-orange-700 hover:underline"
                    >
                      {file.originalName}
                    </a>
                    <span className="text-xs text-muted-foreground">
                      {file.uploadedByName} · {formatDateTime(file.uploadedAt)}
                    </span>
                  </div>

                  {canUpload && pending ? (
                    <button
                      type="button"
                      aria-label={`Hapus ${file.originalName}`}
                      disabled={isDeleting}
                      onClick={() =>
                        startDelete(async () => {
                          const outcome = await deleteMonitoringEvidence(file.id);
                          if (outcome.ok) router.refresh();
                          else
                            toast.error("Hapus evidence gagal", { description: outcome.message });
                        })
                      }
                      className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Belum ada evidence untuk periode ini.</p>
          )}

          {canUpload && pending ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 aria-hidden className="animate-spin" />
                ) : (
                  <FileUp aria-hidden />
                )}
                Upload evidence
              </Button>
            </>
          ) : null}
        </div>

        {pending ? null : (
          <div className="rounded-lg bg-secondary px-3 py-2.5">
            <p className="flex items-center gap-2 text-sm font-medium">
              {period.status === "EFFECTIVE" ? (
                <CheckCircle2 aria-hidden className="size-4 text-[var(--status-closed)]" />
              ) : (
                <XCircle aria-hidden className="size-4 text-[var(--status-danger)]" />
              )}
              {MONITORING_STATUS_LABEL[period.status]}
            </p>
            {period.note ? (
              <p className="mt-1 whitespace-pre-line break-words text-sm">{period.note}</p>
            ) : null}
            {period.filledByName ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Dinilai {period.filledByName}
                {period.filledAt ? ` · ${formatDateTime(period.filledAt)}` : ""}
              </p>
            ) : null}
          </div>
        )}

        {canAssess && pending ? (
          <div className="space-y-3 border-t border-nid-border pt-3">
            {error ? (
              <p
                role="alert"
                className="rounded-md bg-[var(--status-danger-bg)] px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}

            {showReject ? (
              <div className="space-y-1.5">
                <Label htmlFor={`note-${period.id}`}>
                  Apa yang belum berhasil?<span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Textarea
                  id={`note-${period.id}`}
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Mis. masih ditemukan 3 pcs kaki patah pada 500 pcs pertama; alarm tekanan belum terpasang di mesin 5."
                />
                <p className="text-xs text-muted-foreground">
                  Not Effective memulangkan klaim ke pengisian CPAR dan menaikkan siklus.
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => void assess("EFFECTIVE")}
                disabled={deciding !== null}
              >
                {deciding === "EFFECTIVE" ? (
                  <Loader2 aria-hidden className="animate-spin" />
                ) : (
                  <CheckCircle2 aria-hidden />
                )}
                Effective
              </Button>

              {showReject ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void assess("NOT_EFFECTIVE")}
                    disabled={deciding !== null}
                  >
                    {deciding === "NOT_EFFECTIVE" ? (
                      <Loader2 aria-hidden className="animate-spin" />
                    ) : (
                      <XCircle aria-hidden />
                    )}
                    Kirim penilaian Not Effective
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={deciding !== null}
                    onClick={() => setShowReject(false)}
                  >
                    Batal
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowReject(true)}
                >
                  <CircleDashed aria-hidden />
                  Not Effective
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}
