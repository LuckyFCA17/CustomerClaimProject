"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { FieldErrors, UseFormRegister } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { submitUpload } from "@/components/shared/submit-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select-native";
import type { ClaimFormValues } from "@/schemas/claim";
import { deletePartPhoto, uploadPartPhoto } from "@/server/actions/claim";

export interface PartPhoto {
  readonly id: string;
  readonly url: string;
  readonly originalName: string;
  readonly caption: string | null;
}

/** Satu panel pada Part Comparison (§7C): Standard atau Actual. */
export function PartPanel({
  claimId,
  side,
  title,
  register,
  errors,
  photos,
}: {
  claimId: string;
  side: "STANDARD" | "ACTUAL";
  title: string;
  register: UseFormRegister<ClaimFormValues>;
  errors: FieldErrors<ClaimFormValues>;
  photos: readonly PartPhoto[];
}) {
  const key = side === "STANDARD" ? "standard" : "actual";
  const panelErrors = errors[key];
  const fileRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [isUploading, setUploading] = useState(false);

  const photoError =
    side === "ACTUAL" && photos.length === 0
      ? (errors as Record<string, { message?: string } | undefined>)["actual.photos"]?.message
      : undefined;

  async function onPick(file: File) {
    setUploading(true);

    try {
      const sent = await submitUpload(
        file,
        (chosen) => {
          const formData = new FormData();
          formData.set("claimId", claimId);
          formData.set("side", side);
          formData.set("file", chosen);
          return formData;
        },
        uploadPartPhoto,
      );

      if (sent) toast.success("Foto terunggah");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-nid-border p-4">
      <h3 className="font-display text-sm font-semibold">{title}</h3>

      <div className="space-y-2">
        <Label>
          Photo <span className="text-xs font-normal text-muted-foreground">(maksimal 5)</span>
          {side === "ACTUAL" ? <span className="ml-0.5 text-destructive">*</span> : null}
        </Label>

        {photos.length > 0 ? (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photos.map((photo) => (
              <li key={photo.id} className="group relative overflow-hidden rounded-lg border border-nid-border">
                <Image
                  src={photo.url}
                  alt={photo.caption ?? photo.originalName}
                  width={320}
                  height={240}
                  unoptimized
                  className="aspect-[4/3] w-full object-cover"
                />
                <button
                  type="button"
                  aria-label={`Hapus foto ${photo.originalName}`}
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await deletePartPhoto(photo.id);
                      if (!result.ok) toast.error("Hapus foto gagal", { description: result.message });
                    })
                  }
                  className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-md bg-nid-ink/70 text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 aria-hidden className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-nid-border px-3 py-6 text-center text-xs text-muted-foreground">
            Belum ada foto.
          </p>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onPick(file);
          }}
        />

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isUploading || photos.length >= 5}
          onClick={() => fileRef.current?.click()}
        >
          {isUploading ? <Loader2 aria-hidden className="animate-spin" /> : <ImagePlus aria-hidden />}
          {photos.length >= 5 ? "Batas lima foto tercapai" : "Upload photo"}
        </Button>

        {photoError ? <p className="text-xs text-destructive">{photoError}</p> : null}
      </div>

      <PanelField label="Photo Description" error={panelErrors?.photoCaption?.message}>
        <Input {...register(`${key}.photoCaption` as const)} />
      </PanelField>

      <PanelField label="Part Name" error={panelErrors?.partName?.message} required>
        <Input {...register(`${key}.partName` as const)} />
      </PanelField>

      <PanelField label="NID Part No." error={panelErrors?.nidPartNo?.message} required>
        <Input {...register(`${key}.nidPartNo` as const)} />
      </PanelField>

      <PanelField label="Qty" error={panelErrors?.qty?.message ?? panelErrors?.qtyUnit?.message} required>
        <div className="flex gap-2">
          <Input type="number" min="0" step="any" inputMode="decimal" {...register(`${key}.qty` as const)} />
          <SelectNative className="w-28" {...register(`${key}.qtyUnit` as const)}>
            <option value="PCS">Pcs</option>
            <option value="BOX">Box</option>
          </SelectNative>
        </div>
      </PanelField>

      <PanelField label="Dimension Item" error={panelErrors?.dimensionItem?.message}>
        <Input {...register(`${key}.dimensionItem` as const)} />
      </PanelField>

      <PanelField label="Appearance Item" error={panelErrors?.appearanceItem?.message}>
        <Input {...register(`${key}.appearanceItem` as const)} />
      </PanelField>
    </div>
  );
}

function PanelField({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
