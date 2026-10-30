"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleAlert, Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { submitCparFinal } from "@/server/actions/cpar-filling";

/**
 * Submit CPAR final beserta pop-up "Submission incomplete" (kriteria penerimaan #7).
 *
 * Tombolnya sengaja tidak dinonaktifkan ketika masih ada section kosong. Tombol mati
 * tidak memberi tahu apa yang kurang — sedangkan menekannya memunculkan daftar section
 * yang masih harus diisi, yang justru merupakan jawaban yang dicari.
 */
export function SubmitFinal({ claimId, cparNo }: { claimId: string; cparNo: string }) {
  const router = useRouter();
  const [missing, setMissing] = useState<readonly string[] | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);

    try {
      const result = await submitCparFinal(claimId);

      if (!result.ok) {
        if (result.missingSections?.length) {
          setMissing(result.missingSections);
          return;
        }

        toast.error("Submit CPAR gagal", { description: result.message });
        return;
      }

      toast.success("CPAR final terkirim", { description: result.message });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" size="lg" onClick={() => void submit()} disabled={pending}>
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
        Submit CPAR final report
      </Button>

      <Dialog open={missing !== null} onOpenChange={(open) => !open && setMissing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CircleAlert aria-hidden className="size-5 text-[var(--status-pending)]" />
              Submission incomplete
            </DialogTitle>
            <DialogDescription>
              {cparNo} belum dapat dikirim ke verifikasi. Section wajib berikut masih kosong:
            </DialogDescription>
          </DialogHeader>

          <ul className="list-inside list-disc space-y-1 rounded-lg bg-secondary px-4 py-3 text-sm">
            {(missing ?? []).map((section) => (
              <li key={section}>{section}</li>
            ))}
          </ul>

          <DialogFooter>
            <Button type="button" onClick={() => setMissing(null)}>
              Lengkapi sekarang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
