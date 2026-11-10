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
 * Tombolnya sengaja tidak dinonaktifkan ketika masih ada yang kurang. Tombol mati tidak
 * memberi tahu apa yang kurang — sedangkan menekannya memunculkan daftarnya, yang justru
 * merupakan jawaban yang dicari.
 *
 * Daftar itu memuat dua hal: section wajib yang masih kosong, dan evidence yang belum
 * dilampirkan. Keduanya datang sudah berupa kalimat dari server, jadi komponen ini tidak
 * perlu tahu bedanya.
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
              {cparNo} belum dapat dikirim ke verifikasi. Berikut yang masih kurang —
              section wajib yang kosong, dan evidence yang belum dilampirkan:
            </DialogDescription>
          </DialogHeader>

          {/* Daftarnya bisa panjang — satu action plan dengan sepuluh baris berarti
              sepuluh evidence. Dibatasi tingginya supaya tombol di bawahnya tetap
              terjangkau tanpa menggulir seluruh dialog. */}
          <ul className="max-h-64 list-inside list-disc space-y-1 overflow-y-auto rounded-lg bg-secondary px-4 py-3 text-sm">
            {(missing ?? []).map((entry) => (
              <li key={entry}>{entry}</li>
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
