"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Trash2 } from "lucide-react";

import { formatDateTime } from "@/lib/format";
import { deleteCparEvidence } from "@/server/actions/cpar-filling";

export interface LegacyEvidenceFile {
  readonly id: string;
  readonly originalName: string;
  readonly url: string;
  readonly uploadedByName: string;
  readonly uploadedAt: Date;
}

/**
 * Berkas yang terlanjur diunggah ke daftar evidence umum CPAR.
 *
 * Daftar itu sudah tidak ada: evidence kini menempel pada bagian yang memintanya —
 * dokumen awal, tindakan perbaikan tetap, dan standardisasi — sehingga pembacanya tidak
 * perlu menebak satu berkas milik bagian yang mana.
 *
 * Yang tersisa di sini hanya berkas lama, dan hanya selama masih ada. Menghapus
 * tampilannya begitu saja akan membuat berkas yang sudah diunggah orang lenyap dari
 * layar tanpa pernah dikabarkan; yang ditawarkan justru sebaliknya — dibuka, lalu
 * dipindahkan ke bagiannya, lalu dihapus dari sini.
 */
export function LegacyEvidence({
  files,
  canDelete,
}: {
  files: readonly LegacyEvidenceFile[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [isDeleting, startDelete] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  return (
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

          {canDelete ? (
            <button
              type="button"
              aria-label={`Hapus ${file.originalName}`}
              disabled={isDeleting && busy === file.id}
              onClick={() => {
                setBusy(file.id);
                startDelete(async () => {
                  const result = await deleteCparEvidence(file.id);
                  if (result.ok) router.refresh();
                  else toast.error("Hapus berkas gagal", { description: result.message });
                });
              }}
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary"
            >
              <Trash2 aria-hidden className="size-4" />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
