"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { discardClaimDraft } from "@/server/actions/claim";

/**
 * Membuang draft klaim yang belum pernah dikirim.
 *
 * Diberi dialog konfirmasi, tidak seperti tombol hapus foto. Bedanya pada apa yang
 * hilang bila salah tekan: foto dapat diunggah ulang dalam hitungan detik, sedangkan
 * draft membawa seluruh isian yang sudah diketik — dan di layar sentuh tombol yang
 * bersebelahan dengan "Save draft" terlalu mudah terkena tanpa sengaja.
 *
 * Tombolnya hanya dirender bila `can(user, "claim.discard", claim)` lolos di server;
 * komponen ini tidak memutuskan apa pun tentang izin.
 */
export function DiscardDraft({ claimId, label }: { claimId: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="text-destructive hover:bg-[var(--status-danger-bg)] hover:text-destructive"
        onClick={() => setOpen(true)}
        disabled={isPending}
      >
        {isPending ? <Loader2 aria-hidden className="animate-spin" /> : <Trash2 aria-hidden />}
        Buang draft
      </Button>

      <Dialog open={open} onOpenChange={(next) => !isPending && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert aria-hidden className="size-5 text-destructive" />
              Buang draft ini?
            </DialogTitle>
            <DialogDescription>
              {label} beserta seluruh isian dan fotonya akan hilang dari daftar klaim.
              Draft ini belum pernah dikirim, jadi belum ada nomor klaim yang terpakai.
            </DialogDescription>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Catatannya tetap tersimpan di audit log atas nama Anda. Untuk memulihkannya,
            hubungi Administrator.
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Batal
            </Button>

            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const result = await discardClaimDraft(claimId);

                  if (!result.ok) {
                    toast.error("Draft gagal dibuang", { description: result.message });
                    return;
                  }

                  toast.success("Draft dibuang");
                  setOpen(false);
                  // Halaman draft ini sudah tidak ada; tetap di sini berarti menatap
                  // formulir yang setiap penyimpanannya akan ditolak.
                  router.replace("/claims");
                  router.refresh();
                })
              }
            >
              {isPending ? <Loader2 aria-hidden className="animate-spin" /> : <Trash2 aria-hidden />}
              Ya, buang draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
