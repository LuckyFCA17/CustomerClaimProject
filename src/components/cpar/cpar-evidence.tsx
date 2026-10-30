"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Loader2, Trash2 } from "lucide-react";

import { submitUpload } from "@/components/shared/submit-upload";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { deleteCparEvidence, uploadCparEvidence } from "@/server/actions/cpar-filling";

export interface CparEvidenceFile {
  readonly id: string;
  readonly originalName: string;
  readonly url: string;
  readonly uploadedByName: string;
  readonly uploadedAt: Date;
}

/**
 * Evidence pendukung CPAR (§6 Modul 3).
 *
 * Terpisah dari section: satu berkas sering menjadi bukti bagi beberapa section sekaligus
 * — foto jig baru mendukung permanent countermeasure sekaligus standardization — dan
 * menempelkannya ke satu section akan menyembunyikannya dari yang lain.
 */
export function CparEvidence({
  claimId,
  files,
  canUpload,
}: {
  claimId: string;
  files: readonly CparEvidenceFile[];
  canUpload: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [isDeleting, startDelete] = useTransition();

  async function upload(file: File) {
    setUploading(true);

    try {
      const sent = await submitUpload(
        file,
        (chosen) => {
          const formData = new FormData();
          formData.set("claimId", claimId);
          formData.set("file", chosen);
          return formData;
        },
        uploadCparEvidence,
      );

      if (sent) router.refresh();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      {files.length > 0 ? (
        <ul className="divide-y divide-nid-border rounded-lg border border-nid-border">
          {files.map((file) => (
            <li key={file.id} className="flex items-center gap-3 px-3 py-2.5">
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

              {canUpload ? (
                <button
                  type="button"
                  aria-label={`Hapus ${file.originalName}`}
                  disabled={isDeleting}
                  onClick={() =>
                    startDelete(async () => {
                      const result = await deleteCparEvidence(file.id);
                      if (result.ok) router.refresh();
                      else toast.error("Hapus evidence gagal", { description: result.message });
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
        <p className="rounded-lg border border-dashed border-nid-border px-3 py-6 text-center text-sm text-muted-foreground">
          Belum ada evidence.
        </p>
      )}

      {canUpload ? (
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
            {uploading ? <Loader2 aria-hidden className="animate-spin" /> : <FileUp aria-hidden />}
            Upload evidence
          </Button>
        </>
      ) : null}
    </div>
  );
}
