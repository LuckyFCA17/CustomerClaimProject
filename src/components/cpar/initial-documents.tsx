"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleCheck, CircleDashed, FileUp, Loader2, Trash2 } from "lucide-react";

import type { PicOption } from "@/components/cpar/action-plan-editor";
import { submitUpload } from "@/components/shared/submit-upload";
import { Button } from "@/components/ui/button";
import { SelectNative } from "@/components/ui/select-native";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  assignInitialDocumentPic,
  deleteCparEvidence,
  uploadInitialDocument,
} from "@/server/actions/cpar-filling";
import { ACCEPT_EVIDENCE } from "@/lib/uploads";

export interface RequestedDocumentFile {
  readonly id: string;
  readonly originalName: string;
  readonly url: string;
  readonly uploadedByName: string;
  readonly uploadedAt: Date;
}

export interface RequestedDocument {
  readonly initialDocumentId: string;
  readonly name: string;
  readonly picId: string | null;
  readonly fulfilledAt: Date | null;
  readonly files: readonly RequestedDocumentFile[];
}

/**
 * Initial Document Request (§6 Modul 3) — daftar dokumen yang diminta bersama CPAR.
 *
 * Bukan lagi sekadar daftar centang: tiap permintaan menyebut siapa yang diminta
 * melengkapinya dan menampung berkasnya sendiri. Dokumen yang diminta tanpa nama di
 * belakangnya tidak pernah jelas menunggu siapa, dan berkas yang dilampirkan ke daftar
 * evidence umum membuat pembacanya harus menebak permintaan mana yang sudah terpenuhi.
 *
 * Terpenuhi atau belum ditentukan dari ada tidaknya berkas, bukan dari centang manual.
 * Centang yang dapat diisi tanpa berkas akan dipakai untuk menutup permintaan yang
 * sebenarnya masih kosong.
 */
export function InitialDocuments({
  claimId,
  documents,
  people,
  canAssign,
  canUpload,
}: {
  claimId: string;
  documents: readonly RequestedDocument[];
  people: readonly PicOption[];
  canAssign: boolean;
  canUpload: boolean;
}) {
  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">Tidak ada dokumen yang diminta.</p>;
  }

  const outstanding = documents.filter((document) => document.files.length === 0).length;

  return (
    <div className="space-y-3">
      <ul className="space-y-2.5">
        {documents.map((document) => (
          <li key={document.initialDocumentId}>
            <DocumentRow
              claimId={claimId}
              document={document}
              people={people}
              canAssign={canAssign}
              canUpload={canUpload}
            />
          </li>
        ))}
      </ul>

      {outstanding > 0 ? (
        <p className="text-xs text-[var(--status-pending)]">
          {outstanding} dari {documents.length} dokumen belum dilampirkan.
        </p>
      ) : (
        <p className="text-xs text-[var(--status-closed)]">
          Seluruh dokumen yang diminta sudah dilampirkan.
        </p>
      )}
    </div>
  );
}

function DocumentRow({
  claimId,
  document,
  people,
  canAssign,
  canUpload,
}: {
  claimId: string;
  document: RequestedDocument;
  people: readonly PicOption[];
  canAssign: boolean;
  canUpload: boolean;
}) {
  const router = useRouter();
  const picId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const fulfilled = document.files.length > 0;
  const pic = people.find((person) => person.id === document.picId);

  async function upload(file: File) {
    setUploading(true);

    try {
      const sent = await submitUpload(
        file,
        (chosen) => {
          const formData = new FormData();
          formData.set("claimId", claimId);
          formData.set("initialDocumentId", document.initialDocumentId);
          formData.set("file", chosen);
          return formData;
        },
        uploadInitialDocument,
      );

      if (sent) router.refresh();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function assign(value: string) {
    startTransition(async () => {
      const result = await assignInitialDocumentPic(
        claimId,
        document.initialDocumentId,
        value || null,
      );

      if (result.ok) {
        toast.success("PIC diperbarui", { description: result.message });
        router.refresh();
      } else {
        toast.error("Gagal menunjuk PIC", { description: result.message });
      }
    });
  }

  return (
    <div className="rounded-lg border border-nid-border px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        {fulfilled ? (
          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--status-closed)]" />
        ) : (
          <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        )}

        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium break-words">{document.name}</div>
          <div className="text-xs text-muted-foreground">
            {fulfilled
              ? `Dilampirkan ${formatDate(document.fulfilledAt)}`
              : "Belum dilampirkan"}
          </div>
        </div>
      </div>

      <div className="mt-2 grid gap-2 pl-6.5 sm:grid-cols-[minmax(0,16rem)_1fr] sm:items-start">
        <div className="space-y-1">
          <label htmlFor={picId} className="text-[11px] text-muted-foreground">
            PIC yang diminta
          </label>
          {canAssign ? (
            <SelectNative
              id={picId}
              value={document.picId ?? ""}
              disabled={isPending}
              onChange={(event) => assign(event.target.value)}
            >
              <option value="">— Belum ditunjuk —</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                  {person.departmentCode ? ` · ${person.departmentCode}` : ""}
                </option>
              ))}
            </SelectNative>
          ) : (
            <p id={picId} className="text-sm">
              {pic ? (
                <>
                  {pic.name}
                  {pic.departmentCode ? (
                    <span className="text-muted-foreground"> · {pic.departmentCode}</span>
                  ) : null}
                </>
              ) : document.picId ? (
                <span className="text-[var(--status-pending)]">PIC sudah tidak aktif</span>
              ) : (
                <span className="text-muted-foreground">Belum ditunjuk</span>
              )}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          {document.files.length > 0 ? (
            <ul className="space-y-1">
              {document.files.map((file) => (
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
                    {file.uploadedByName} · {formatDateTime(file.uploadedAt)}
                  </span>

                  {canUpload ? (
                    <button
                      type="button"
                      aria-label={`Hapus ${file.originalName}`}
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await deleteCparEvidence(file.id);
                          if (result.ok) router.refresh();
                          else toast.error("Hapus berkas gagal", { description: result.message });
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
                variant="ghost"
                size="sm"
                disabled={uploading}
                aria-label={`Upload ${document.name}`}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 aria-hidden className="animate-spin" />
                ) : (
                  <FileUp aria-hidden />
                )}
                Upload dokumen
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
