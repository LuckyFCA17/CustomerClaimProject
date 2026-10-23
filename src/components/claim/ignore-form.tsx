"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Loader2, Trash2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { IGNORE_REASON_MIN } from "@/schemas/cpar";
import {
  deleteIgnorationEvidence,
  ignoreClaim,
  uploadIgnorationEvidence,
} from "@/server/actions/cpar";

export interface EvidenceFile {
  readonly id: string;
  readonly originalName: string;
  readonly url: string;
  readonly isImage: boolean;
}

/**
 * Jalur Ignore (§6 Modul 2): menutup klaim tanpa CPAR.
 *
 * Ini satu-satunya jalan menutup klaim tanpa countermeasure, dan tidak bisa dibatalkan,
 * jadi formulirnya sengaja menuntut dua hal: alasan yang benar-benar menjelaskan, dan
 * evidence yang dapat diperiksa kembali.
 */
export function IgnoreForm({
  claimId,
  claimType,
  evidence,
}: {
  claimId: string;
  claimType: string | null;
  evidence: readonly EvidenceFile[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDeleting, startDelete] = useTransition();

  const needsAcknowledgement = claimType !== "INFORMATION_ONLY";
  const remaining = Math.max(0, IGNORE_REASON_MIN - reason.trim().length);

  async function upload(file: File) {
    setUploading(true);

    try {
      const formData = new FormData();
      formData.set("claimId", claimId);
      formData.set("file", file);

      const result = await uploadIgnorationEvidence(formData);

      if (result.ok) {
        toast.success("Evidence terunggah");
        router.refresh();
      } else {
        toast.error("Unggah evidence gagal", { description: result.message });
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit() {
    setErrors({});
    setPending(true);

    try {
      const result = await ignoreClaim(claimId, { reason, acknowledged });

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error("Ignore claim gagal", { description: result.message });
        return;
      }

      toast.success("Ignore claim", { description: result.message });
      router.push(`/claims/${claimId}`);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Ignoration Reason</CardTitle>
          <CardDescription>
            Alasan ini tersimpan permanen dan ikut dikirim ke seluruh user portal. Tulis agar masih
            dapat dipahami auditor setahun dari sekarang.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            id="reason"
            rows={5}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Mis. part yang diklaim bukan produksi NID; nomor lot pada foto milik pemasok lain, dikonfirmasi lewat delivery record terlampir."
            aria-describedby="reason-counter"
          />
          <p id="reason-counter" className="text-xs text-muted-foreground">
            {remaining > 0
              ? `Kurang ${remaining} karakter lagi.`
              : `${reason.trim().length} karakter.`}
          </p>
          <FieldError messages={errors.reason} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evidence</CardTitle>
          <CardDescription>
            Minimal satu berkas yang mendukung alasan di atas — foto, delivery record, atau
            korespondensi dengan pelanggan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {evidence.length > 0 ? (
            <ul className="divide-y divide-nid-border rounded-lg border border-nid-border">
              {evidence.map((file) => (
                <li key={file.id} className="flex items-center gap-3 px-3 py-2.5">
                  <FileUp aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener"
                    className="min-w-0 flex-1 truncate text-sm text-nid-orange-700 hover:underline"
                  >
                    {file.originalName}
                  </a>
                  <button
                    type="button"
                    aria-label={`Hapus ${file.originalName}`}
                    disabled={isDeleting}
                    onClick={() =>
                      startDelete(async () => {
                        const result = await deleteIgnorationEvidence(file.id);
                        if (result.ok) router.refresh();
                        else toast.error("Hapus evidence gagal", { description: result.message });
                      })
                    }
                    className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-nid-border px-3 py-6 text-center text-sm text-muted-foreground">
              Belum ada evidence.
            </p>
          )}

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

          <FieldError messages={errors.evidence} />
        </CardContent>
      </Card>

      {needsAcknowledgement ? (
        <Card>
          <CardContent className="p-5">
            <label className="flex cursor-pointer items-start gap-3">
              <Checkbox
                className="mt-0.5"
                checked={acknowledged}
                onCheckedChange={(value) => setAcknowledged(value === true)}
              />
              <span className="text-sm">
                Saya memahami klaim ini bukan <strong>Information Only</strong>, dan menutupnya
                tanpa CPAR berarti tidak ada countermeasure yang akan dijalankan maupun dipantau.
              </span>
            </label>
            <div className="mt-2 pl-7">
              <FieldError messages={errors.acknowledged} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          variant="destructive"
          onClick={() => void submit()}
          disabled={pending || (needsAcknowledgement && !acknowledged)}
        >
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : <XCircle aria-hidden />}
          Ignore claim
        </Button>
        <span className="text-xs text-muted-foreground">
          Klaim ditutup permanen; status Ignored tidak dapat dikembalikan.
        </span>
      </div>
    </div>
  );
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;

  return <p className="text-xs text-destructive">{messages[0]}</p>;
}
