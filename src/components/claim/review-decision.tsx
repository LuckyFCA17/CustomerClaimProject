"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reviewClaim } from "@/server/actions/claim";

/**
 * Dua keputusan QA Dept. Head (§6 Modul 1).
 *
 * Komentar wajib hanya pada jalur revisi, dan kotaknya baru muncul setelah jalur itu
 * dipilih — supaya halaman review tidak terbaca seolah approve pun perlu alasan.
 */
export function ReviewDecision({ claimId }: { claimId: string }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [showComment, setShowComment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"APPROVE" | "REVISE" | null>(null);

  async function decide(decision: "APPROVE" | "REVISE") {
    setError(null);
    setPending(decision);

    try {
      const result = await reviewClaim(claimId, { decision, comment });

      if (!result.ok) {
        setError(result.fieldErrors?.comment?.[0] ?? result.message ?? "Keputusan gagal disimpan.");
        toast.error(decision === "APPROVE" ? "Approve claim gagal" : "Request revision gagal", {
          description: result.message,
        });
        return;
      }

      toast.success(decision === "APPROVE" ? "Approve claim" : "Request revision", {
        description: result.message,
      });

      router.push(`/claims/${claimId}`);
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="rounded-md bg-[var(--status-danger-bg)] px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {showComment ? (
        <div className="space-y-1.5">
          <Label htmlFor="review-comment">
            Apa yang perlu diperbaiki?<span className="ml-0.5 text-destructive">*</span>
          </Label>
          <Textarea
            id="review-comment"
            rows={4}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Sebutkan bagian mana yang perlu dilengkapi atau dikoreksi QA."
          />
          <p className="text-xs text-muted-foreground">
            Komentar ini dikirim ke QA pembuat klaim dan tersimpan di audit trail.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="button" size="lg" onClick={() => void decide("APPROVE")} disabled={pending !== null}>
          {pending === "APPROVE" ? <Loader2 aria-hidden className="animate-spin" /> : <CheckCircle2 aria-hidden />}
          Approve claim
        </Button>

        {showComment ? (
          <Button
            type="button"
            size="lg"
            variant="outline"
            onClick={() => void decide("REVISE")}
            disabled={pending !== null}
          >
            {pending === "REVISE" ? <Loader2 aria-hidden className="animate-spin" /> : <RotateCcw aria-hidden />}
            Kirim permintaan revisi
          </Button>
        ) : (
          <Button type="button" size="lg" variant="outline" onClick={() => setShowComment(true)}>
            <RotateCcw aria-hidden />
            Request revision
          </Button>
        )}

        {showComment ? (
          <Button type="button" variant="ghost" onClick={() => setShowComment(false)} disabled={pending !== null}>
            Batal
          </Button>
        ) : null}
      </div>
    </div>
  );
}
