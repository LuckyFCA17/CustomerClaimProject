"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CparSectionKey } from "@/generated/prisma/enums";
import { SECTION_LABEL, SECTION_ORDER, VERIFIER_CAPACITY_LABEL } from "@/lib/cpar";
import { verifyCpar } from "@/server/actions/cpar-filling";

/**
 * Keputusan satu verifier (§6 Modul 3).
 *
 * Verified berdiri sendiri; Needs revision membuka kotak komentar beserta daftar section
 * yang dapat ditandai. Penandaan itu opsional tetapi sangat menentukan: tanpa itu pengisi
 * hanya menerima "perbaiki", dan harus menebak bagian mana yang dimaksud.
 */
export function VerificationPanel({
  claimId,
  capacity,
}: {
  claimId: string;
  capacity: string;
}) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [targets, setTargets] = useState<CparSectionKey[]>([]);
  const [showRevise, setShowRevise] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"VERIFIED" | "REVISE" | null>(null);

  function toggleTarget(key: CparSectionKey, checked: boolean) {
    setTargets((current) =>
      checked ? [...current, key] : current.filter((entry) => entry !== key),
    );
  }

  async function decide(decision: "VERIFIED" | "REVISE") {
    setError(null);
    setPending(decision);

    try {
      const result = await verifyCpar(claimId, {
        decision,
        comment,
        targetSections: decision === "REVISE" ? targets : [],
      });

      if (!result.ok) {
        setError(result.fieldErrors?.comment?.[0] ?? result.message ?? "Keputusan gagal disimpan.");
        toast.error(decision === "VERIFIED" ? "Verifikasi gagal" : "Permintaan revisi gagal", {
          description: result.message,
        });
        return;
      }

      toast.success(decision === "VERIFIED" ? "CPAR diverifikasi" : "CPAR dikembalikan", {
        description: result.message,
      });

      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Anda memutuskan dalam kapasitas{" "}
        <strong className="font-medium text-foreground">
          {VERIFIER_CAPACITY_LABEL[capacity] ?? capacity}
        </strong>
        . Satu keputusan per kapasitas per siklus, dan keputusan itu tidak dapat ditarik.
      </p>

      {error ? (
        <p
          role="alert"
          className="rounded-md bg-[var(--status-danger-bg)] px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {showRevise ? (
        <div className="space-y-4 rounded-lg border border-nid-border p-4">
          <div className="space-y-1.5">
            <Label htmlFor="verify-comment">
              Apa yang harus diperbaiki?<span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Textarea
              id="verify-comment"
              rows={4}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Mis. root cause occurrence berhenti di gejala; telusuri sampai parameter mesin yang bisa dikendalikan."
            />
            <p className="text-xs text-muted-foreground">
              Komentar ini dikirim ke pengisi CPAR dan tersimpan sebagai riwayat siklus{" "}
              {VERIFIER_CAPACITY_LABEL[capacity] ?? capacity}.
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Section yang bermasalah (opsional)</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {SECTION_ORDER.map((key) => (
                <label key={key} className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={targets.includes(key)}
                    onCheckedChange={(checked) => toggleTarget(key, checked === true)}
                  />
                  <span className="min-w-0">{SECTION_LABEL[key]}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          size="lg"
          onClick={() => void decide("VERIFIED")}
          disabled={pending !== null}
        >
          {pending === "VERIFIED" ? (
            <Loader2 aria-hidden className="animate-spin" />
          ) : (
            <CheckCircle2 aria-hidden />
          )}
          Verified
        </Button>

        {showRevise ? (
          <>
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={() => void decide("REVISE")}
              disabled={pending !== null}
            >
              {pending === "REVISE" ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : (
                <RotateCcw aria-hidden />
              )}
              Kirim permintaan revisi
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending !== null}
              onClick={() => setShowRevise(false)}
            >
              Batal
            </Button>
          </>
        ) : (
          <Button type="button" size="lg" variant="outline" onClick={() => setShowRevise(true)}>
            <RotateCcw aria-hidden />
            Needs revision
          </Button>
        )}
      </div>
    </div>
  );
}
