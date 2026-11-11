"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  FileUp,
  Loader2,
  Trash2,
  XCircle,
} from "lucide-react";

import { ResultsEditor, type ResultRowView } from "@/components/monitoring/results-editor";
import { submitUpload } from "@/components/shared/submit-upload";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { MonitoringStatus } from "@/generated/prisma/enums";
import { MONITORING_STATUS_LABEL, totalResults } from "@/lib/monitoring";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  deleteMonitoringEvidence,
  setEffectiveness,
  uploadCheckEvidence,
  uploadMonitoringEvidence,
} from "@/server/actions/monitoring";
import { ACCEPT_EVIDENCE } from "@/lib/uploads";

export interface PeriodEvidence {
  readonly id: string;
  readonly originalName: string;
  readonly url: string;
  readonly uploadedByName: string;
  readonly uploadedAt: Date;
}

/** Satu item yang dipantau, pada satu periode, beserta buktinya. */
export interface PeriodCheck {
  readonly itemId: string;
  readonly order: number;
  readonly title: string;
  readonly files: readonly PeriodEvidence[];
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
  readonly checks: readonly PeriodCheck[];
  readonly results: readonly ResultRowView[];
}

/**
 * Periode pemantauan beserta evidence dan penilaiannya (§6 Modul 4).
 *
 * Penilaian dan pengumpulan bukti sengaja berada pada kartu yang sama: yang menilai
 * perlu melihat berkas yang menjadi dasarnya tanpa berpindah halaman.
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
          <PeriodCard
            period={period}
            canUpload={canUpload}
            canAssess={canAssess}
            // Periode yang sudah dinilai tertutup; yang masih menunggu terbuka.
            // Yang sudah selesai tidak lagi dikerjakan siapa pun, dan membiarkannya
            // terbentang hanya membuat periode yang justru perlu diisi terdorong jauh
            // ke bawah layar. Siapa pun tetap boleh membuka atau menutup sendiri.
            defaultOpen={period.status === "PENDING"}
          />
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
  defaultOpen,
}: {
  period: PeriodView;
  canUpload: boolean;
  canAssess: boolean;
  defaultOpen: boolean;
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
  const outstandingChecks = period.checks.filter((check) => check.files.length === 0).length;

  async function upload(file: File) {
    setUploading(true);

    try {
      const sent = await submitUpload(
        file,
        (chosen) => {
          const formData = new FormData();
          formData.set("periodId", period.id);
          formData.set("file", chosen);
          return formData;
        },
        uploadMonitoringEvidence,
      );

      if (sent) router.refresh();
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

  // Ringkasan yang terbaca saat kartunya ditutup. Tanpa ini, menutup periode berarti
  // menyembunyikan keadaannya — dan orang harus membuka satu per satu untuk tahu mana
  // yang masih perlu dikerjakan, yang justru lebih lambat daripada menggulir.
  const digest = [
    period.checks.length > 0
      ? `${period.checks.length - outstandingChecks}/${period.checks.length} item berbukti`
      : null,
    period.results.length > 0
      ? `${period.results.length} baris · NG ${totalResults(period.results).ngCount.toLocaleString("id-ID")}`
      : null,
  ].filter(Boolean);

  return (
    <details
      open={defaultOpen}
      className="group rounded-lg border border-nid-border bg-card [&[open]>summary]:border-b"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1.5 border-nid-border px-4 py-3 [&::-webkit-details-marker]:hidden">
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
            {/* Barisnya sendiri saat tertutup: disambung di belakang tenggat, ia
                membungkus menjadi tiga baris pendek pada layar ponsel. */}
            {digest.length > 0 ? (
              <span className="block w-full group-open:hidden">{digest.join(" · ")}</span>
            ) : null}
          </p>
        </div>

        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ backgroundColor: tone.bg, color: tone.fg }}
        >
          {MONITORING_STATUS_LABEL[period.status]}
        </span>

        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>

      <div className="space-y-4 px-4 py-3">
        {period.checks.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-xs uppercase tracking-wide text-muted-foreground">
              Item yang dipantau
            </h4>

            <ul className="space-y-2">
              {period.checks.map((check) => (
                <li key={check.itemId}>
                  <CheckRow
                    periodId={period.id}
                    check={check}
                    canUpload={canUpload && pending}
                    onChanged={() => router.refresh()}
                  />
                </li>
              ))}
            </ul>

            {pending && outstandingChecks > 0 ? (
              <p className="text-xs text-[var(--status-pending)]">
                {outstandingChecks} dari {period.checks.length} item belum ada buktinya. Periode
                tidak dapat dinyatakan Effective selama masih ada yang kosong.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-4 border-t border-nid-border pt-3">
          <ResultsEditor
            periodId={period.id}
            kind="PRODUCTION"
            rows={period.results.filter((row) => row.kind === "PRODUCTION")}
            canEdit={canUpload && pending}
          />
          <ResultsEditor
            periodId={period.id}
            kind="INSPECTION"
            rows={period.results.filter((row) => row.kind === "INSPECTION")}
            canEdit={canUpload && pending}
          />
        </div>

        <div className="space-y-2 border-t border-nid-border pt-3">
          <h4 className="text-xs uppercase tracking-wide text-muted-foreground">
            Evidence lain periode ini
          </h4>

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
                accept={ACCEPT_EVIDENCE}
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
    </details>
  );
}

/**
 * Satu item yang dipantau beserta berkasnya.
 *
 * Terpenuhi atau belum ditentukan dari ada tidaknya berkas, bukan dari centang
 * terpisah — sama seperti evidence CPAR. Centang yang dapat diisi tanpa berkas akan
 * dipakai menutup item yang sebenarnya masih kosong, dan itulah justru item yang
 * menentukan apakah periode boleh dinyatakan Effective.
 */
function CheckRow({
  periodId,
  check,
  canUpload,
  onChanged,
}: {
  periodId: string;
  check: PeriodCheck;
  canUpload: boolean;
  onChanged: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [isDeleting, startDelete] = useTransition();

  const fulfilled = check.files.length > 0;

  async function upload(file: File) {
    setUploading(true);

    try {
      const sent = await submitUpload(
        file,
        (chosen) => {
          const formData = new FormData();
          formData.set("periodId", periodId);
          formData.set("itemId", check.itemId);
          formData.set("file", chosen);
          return formData;
        },
        uploadCheckEvidence,
      );

      if (sent) onChanged();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="rounded-lg border border-nid-border px-3 py-2">
      <div className="flex items-start gap-2.5">
        {fulfilled ? (
          <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--status-closed)]" />
        ) : (
          <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        )}

        <p className="min-w-0 flex-1 text-sm break-words">
          <span className="tabular text-muted-foreground">{check.order}.</span> {check.title}
        </p>
      </div>

      {check.files.length > 0 ? (
        <ul className="mt-1.5 space-y-1 pl-6.5">
          {check.files.map((file) => (
            <li key={file.id} className="flex items-center gap-2">
              <FileUp aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              <a
                href={file.url}
                target="_blank"
                rel="noopener"
                className="min-w-0 truncate text-xs text-nid-orange-700 hover:underline"
              >
                {file.originalName}
              </a>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {file.uploadedByName}
              </span>

              {canUpload ? (
                <button
                  type="button"
                  aria-label={`Hapus ${file.originalName}`}
                  disabled={isDeleting}
                  onClick={() =>
                    startDelete(async () => {
                      const outcome = await deleteMonitoringEvidence(file.id);
                      if (outcome.ok) onChanged();
                      else toast.error("Hapus berkas gagal", { description: outcome.message });
                    })
                  }
                  className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary"
                >
                  <Trash2 aria-hidden className="size-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {canUpload ? (
        <div className="mt-1.5 pl-6.5">
          <input
            ref={fileRef}
            type="file"
            data-evidence="check"
            accept={ACCEPT_EVIDENCE}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={uploading}
            aria-label={`Upload bukti ${check.title}`}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? <Loader2 aria-hidden className="animate-spin" /> : <FileUp aria-hidden />}
            Upload bukti
          </Button>
        </div>
      ) : null}
    </div>
  );
}
