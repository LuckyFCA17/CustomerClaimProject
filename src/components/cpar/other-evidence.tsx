"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Loader2, Paperclip, Trash2 } from "lucide-react";

import { submitUpload } from "@/components/shared/submit-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import { EVIDENCE_NAME_MIN } from "@/schemas/cpar";
import { deleteCparEvidence, uploadOtherEvidence } from "@/server/actions/cpar-filling";
import { ACCEPT_EVIDENCE } from "@/lib/uploads";

export interface OtherEvidenceFile {
  readonly id: string;
  /** Nama yang ditentukan pengunggah; kosong pada berkas lama dari daftar evidence umum. */
  readonly name: string | null;
  readonly originalName: string;
  readonly url: string;
  readonly uploadedByName: string;
  readonly uploadedAt: Date;
}

/**
 * Other Supporting Evidence — berkas pendukung di luar yang diminta CPAR.
 *
 * Dua bagian: daftar berkas yang sudah ada, dan satu baris untuk menambah. Menambah
 * memerlukan nama lebih dulu, dan namanya diperiksa sebelum pemilih berkas dibuka —
 * memilih berkas di ponsel memakan beberapa langkah, dan menolaknya sesudah itu karena
 * kolom nama kosong berarti seluruh langkah itu diulang.
 *
 * Berkas lama dari daftar evidence umum yang sudah ditiadakan ikut tampil di sini: ember
 * penyimpanannya sama, dan memang inilah jenisnya. Yang tidak punya nama ditampilkan
 * dengan nama aslinya, tanpa pura-pura ada yang pernah menamainya.
 */
export function OtherEvidence({
  claimId,
  files,
  canUpload,
}: {
  claimId: string;
  files: readonly OtherEvidenceFile[];
  canUpload: boolean;
}) {
  const router = useRouter();
  const nameId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDeleting, startDelete] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function pick() {
    if (name.trim().length < EVIDENCE_NAME_MIN) {
      setError(`Beri nama berkasnya, minimal ${EVIDENCE_NAME_MIN} karakter.`);
      return;
    }

    setError(null);
    fileRef.current?.click();
  }

  async function upload(file: File) {
    setUploading(true);

    try {
      const sent = await submitUpload(
        file,
        (chosen) => {
          const formData = new FormData();
          formData.set("claimId", claimId);
          formData.set("name", name.trim());
          formData.set("file", chosen);
          return formData;
        },
        uploadOtherEvidence,
      );

      if (sent) {
        setName("");
        router.refresh();
      }
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
            <li key={file.id} className="flex items-start gap-3 px-3 py-2.5">
              <Paperclip aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />

              <div className="min-w-0 flex-1">
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener"
                  // Nama boleh sampai 120 karakter dan dipotong pada layar ponsel; judul
                  // ini yang menyimpan sisanya, supaya dua berkas yang awal namanya sama
                  // masih dapat dibedakan tanpa membukanya satu per satu.
                  title={file.name ?? file.originalName}
                  className="block truncate text-sm font-medium text-nid-orange-700 hover:underline"
                >
                  {file.name ?? file.originalName}
                </a>
                <span className="block truncate text-xs text-muted-foreground">
                  {file.name ? `${file.originalName} · ` : ""}
                  {file.uploadedByName} · {formatDateTime(file.uploadedAt)}
                </span>
              </div>

              {canUpload ? (
                <button
                  type="button"
                  aria-label={`Hapus ${file.name ?? file.originalName}`}
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
      ) : (
        <p className="text-sm text-muted-foreground">
          Belum ada berkas pendukung tambahan.
          {canUpload ? " Bagian ini boleh dibiarkan kosong — isinya tidak menahan submit." : ""}
        </p>
      )}

      {canUpload ? (
        <div className="space-y-1.5 rounded-lg border border-dashed border-nid-border px-3 py-3">
          <label htmlFor={nameId} className="text-xs text-muted-foreground">
            Nama berkas
          </label>

          <div className="flex flex-wrap items-start gap-2">
            <Input
              id={nameId}
              value={name}
              maxLength={120}
              disabled={uploading}
              placeholder="Mis. Foto hasil sortir 100% di warehouse NID"
              aria-invalid={error !== null}
              onChange={(event) => {
                setName(event.target.value);
                if (error) setError(null);
              }}
              className="min-w-0 flex-1 basis-56"
            />

            <input
              ref={fileRef}
              type="file"
              // Dibedakan dari input evidence yang diminta: unggahan di sini memerlukan
              // nama lebih dulu, jadi uji yang menyapu seluruh input berkas pada halaman
              // CPAR harus melewatinya — bukan mengirim berkas tanpa nama ke sini.
              data-evidence="other"
              accept={ACCEPT_EVIDENCE}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />

            <Button type="button" variant="secondary" disabled={uploading} onClick={pick}>
              {uploading ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : (
                <FileUp aria-hidden />
              )}
              Pilih berkas
            </Button>
          </div>

          {error ? <p className="text-xs text-[var(--status-danger)]">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
