"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleCheckBig, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { A3_BLOCKS, A3_BLOCK_LABEL, REPORT_SUMMARY_MIN } from "@/schemas/monitoring";
import { submitImprovementReport } from "@/server/actions/monitoring";

type Draft = Record<string, string>;

/**
 * Improvement Report penutup (§6 Modul 4).
 *
 * Ringkasan wajib, blok A3 opsional. Blok A3 ditaruh di balik pengungkap supaya form
 * penutup tidak terlihat seperti tujuh kotak wajib — yang menghentikan penutupan klaim
 * hanyalah ringkasan dan periode yang belum efektif, bukan kelengkapan A3.
 */
export function ImprovementReportForm({
  claimId,
  blocker,
}: {
  claimId: string;
  blocker: string | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({});
  const [showA3, setShowA3] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);

  const summary = draft.summary ?? "";
  const remaining = REPORT_SUMMARY_MIN - summary.trim().length;

  function set(field: string, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function submit() {
    setErrors({});
    setPending(true);

    try {
      const result = await submitImprovementReport(claimId, {
        summary,
        lessonLearned: draft.lessonLearned ?? "",
        ...Object.fromEntries(A3_BLOCKS.map((block) => [block, draft[block] ?? ""])),
      });

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error("Klaim belum dapat ditutup", { description: result.message });
        return;
      }

      toast.success("Verified Closed", { description: result.message });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {blocker ? (
        <p className="rounded-md bg-[var(--status-pending-bg)] px-3 py-2 text-sm text-[var(--status-pending)]">
          {blocker}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="report-summary">
          Ringkasan perbaikan<span className="ml-0.5 text-destructive">*</span>
        </Label>
        <Textarea
          id="report-summary"
          rows={5}
          value={summary}
          onChange={(event) => set("summary", event.target.value)}
          placeholder="Apa masalahnya, apa yang diubah, dan apa buktinya bahwa perubahan itu bekerja."
          aria-describedby="report-summary-counter"
        />
        <p id="report-summary-counter" className="text-xs text-muted-foreground">
          {remaining > 0 ? `Kurang ${remaining} karakter lagi.` : `${summary.trim().length} karakter.`}
        </p>
        <FieldError messages={errors.summary} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="report-lesson">Lesson learned (opsional)</Label>
        <Textarea
          id="report-lesson"
          rows={3}
          value={draft.lessonLearned ?? ""}
          onChange={(event) => set("lessonLearned", event.target.value)}
          placeholder="Apa yang sebaiknya dilakukan berbeda bila masalah serupa muncul lagi."
        />
        <FieldError messages={errors.lessonLearned} />
      </div>

      {showA3 ? (
        <fieldset className="space-y-4 rounded-lg border border-nid-border p-4">
          <legend className="px-1 text-sm font-medium">Blok A3 (opsional)</legend>

          {A3_BLOCKS.map((block) => (
            <div key={block} className="space-y-1.5">
              <Label htmlFor={`a3-${block}`}>{A3_BLOCK_LABEL[block]}</Label>
              <Textarea
                id={`a3-${block}`}
                rows={3}
                value={draft[block] ?? ""}
                onChange={(event) => set(block, event.target.value)}
              />
              <FieldError messages={errors[block]} />
            </div>
          ))}
        </fieldset>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setShowA3(true)}>
          Isi blok A3
        </Button>
      )}

      <FieldError messages={errors._form} />

      <Button
        type="button"
        size="lg"
        onClick={() => void submit()}
        disabled={pending || blocker !== null}
      >
        {pending ? (
          <Loader2 aria-hidden className="animate-spin" />
        ) : (
          <CircleCheckBig aria-hidden />
        )}
        Submit improvement monitoring report
      </Button>
    </div>
  );
}

function FieldError({ messages }: { messages?: readonly string[] }) {
  if (!messages?.length) return null;

  return (
    <p role="alert" className="text-sm text-destructive">
      {messages[0]}
    </p>
  );
}
