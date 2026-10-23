"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SelectNative } from "@/components/ui/select-native";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { claimSubmitSchema, type ClaimFormValues } from "@/schemas/claim";
import { saveClaimDraft, submitClaim } from "@/server/actions/claim";
import { PartPanel, type PartPhoto } from "@/components/claim/part-panel";

export interface MasterOption {
  readonly id: string;
  readonly name: string;
}

export interface ClaimFormProps {
  readonly claimId: string;
  readonly defaultValues: ClaimFormValues;
  readonly masters: {
    readonly productCategories: readonly MasterOption[];
    readonly ncDetails: readonly MasterOption[];
    readonly customers: readonly MasterOption[];
  };
  readonly photos: {
    readonly standard: readonly PartPhoto[];
    readonly actual: readonly PartPhoto[];
  };
  readonly reviewComment: string | null;
}

const CLAIM_TYPES = [
  ["OFFICIAL", "Official", "Klaim resmi dari pelanggan, lewat surat atau email QA."],
  ["NON_OFFICIAL", "Non-Official", "Temuan yang disampaikan lisan atau melalui kanal tidak resmi."],
  ["INFORMATION_ONLY", "Information Only", "Pemberitahuan saja; boleh ditutup tanpa CPAR."],
] as const;

const SHIFTS = [
  ["MORNING", "Morning"],
  ["NIGHT", "Night"],
] as const;

const FAILURE_PLACE_TYPES = [
  ["REGULAR", "Regular"],
  ["DOMESTIC", "Domestic"],
  ["EXPORT", "Export"],
  ["SERVICE_PART", "Service Part"],
] as const;

const ORIGIN_PLANTS = [
  ["NID", "NID"],
  ["PASSTHROUGH", "Passthrough"],
  ["VENDOR_SUBCON", "Vendor / Sub-Contractor"],
] as const;

const OCCURRENCES = [
  ["FIRST_TIME", "First Time"],
  ["SECOND_TIME", "Second Time"],
  ["THIRD_OR_MORE", "Third or More"],
] as const;

/** Jeda auto-save draft (§6 Modul 1). */
const AUTOSAVE_INTERVAL_MS = 30_000;

export function ClaimForm({
  claimId,
  defaultValues,
  masters,
  photos,
  reviewComment,
}: ClaimFormProps) {
  const router = useRouter();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [isSaving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const form = useForm<ClaimFormValues>({
    // Resolver memakai skema submit, jadi pengguna melihat field wajib yang kosong saat
    // menekan Submit. Save draft sengaja melewatinya — draft memang boleh setengah jadi.
    resolver: zodResolver(claimSubmitSchema) as never,
    defaultValues,
    mode: "onSubmit",
  });

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    setError,
    watch,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = form;

  const originPlantType = watch("originPlantType");
  const needsPlantDetail = originPlantType === "PASSTHROUGH" || originPlantType === "VENDOR_SUBCON";

  const persistDraft = useCallback(
    async (silent: boolean) => {
      if (savingRef.current) return;

      savingRef.current = true;
      setSaving(true);

      try {
        const result = await saveClaimDraft(claimId, getValues());

        if (result.ok) {
          setSavedAt(new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }));
          // Menandai form bersih supaya auto-save berikutnya tidak menyimpan hal yang sama.
          reset(getValues(), { keepErrors: true });
          if (!silent) toast.success("Draft tersimpan");
        } else if (!silent) {
          toast.error("Draft belum tersimpan", { description: result.message });
        }
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [claimId, getValues, reset],
  );

  // Auto-save hanya berjalan bila ada yang berubah, agar tidak membanjiri server
  // dengan penyimpanan kosong setiap 30 detik (asumsi A-17).
  useEffect(() => {
    const timer = setInterval(() => {
      if (isDirty) void persistDraft(true);
    }, AUTOSAVE_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [isDirty, persistDraft]);

  async function onSubmit() {
    // Nilai mentah yang dikirim, bukan hasil transformasi resolver: server memvalidasi
    // ulang dengan skema yang sama, dan itulah pemeriksaan yang mengikat.
    const result = await submitClaim(claimId, getValues());

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          setError(field as keyof ClaimFormValues, { message: messages[0] });
        }
      }

      toast.error("Submit claim information gagal", { description: result.message });
      return;
    }

    toast.success("Submit claim information", { description: result.message });
    router.push(`/claims/${claimId}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {reviewComment ? (
        <div
          role="alert"
          className="rounded-xl border border-nid-border bg-[var(--status-pending-bg)] p-4 text-sm"
        >
          <p className="font-medium text-[var(--status-pending)]">Permintaan revisi dari QA Dept. Head</p>
          <p className="mt-1 whitespace-pre-line text-foreground">{reviewComment}</p>
        </div>
      ) : null}

      <Section
        title="Type of Claim"
        description="Menentukan kewajiban CPAR. Information Only boleh ditutup tanpa CPAR."
      >
        <RadioField
          name="type"
          value={watch("type")}
          onChange={(value) => setValue("type", value, { shouldDirty: true })}
          options={CLAIM_TYPES.map(([value, label, hint]) => ({ value, label, hint }))}
          error={errors.type?.message}
          columns={3}
        />
      </Section>

      <Section title="A. Claim Information">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date of Occurrence" error={errors.dateOfOccurrence?.message} required>
            <div className="flex gap-2">
              <Input type="date" {...register("dateOfOccurrence")} />
              <SelectNative className="w-36" {...register("shiftOfOccurrence")}>
                <option value="">Shift…</option>
                {SHIFTS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectNative>
            </div>
          </Field>

          <Field label="Date of Received" error={errors.dateOfReceived?.message} required>
            <div className="flex gap-2">
              <Input type="date" {...register("dateOfReceived")} />
              <SelectNative className="w-36" {...register("shiftOfReceived")}>
                <option value="">Shift…</option>
                {SHIFTS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectNative>
            </div>
          </Field>

          <Field label="Failure Place" error={errors.failurePlace?.message} required>
            <div className="flex gap-2">
              <Input placeholder="Lokasi temuan" {...register("failurePlace")} />
              <SelectNative className="w-44" {...register("failurePlaceType")}>
                <option value="">Jenis…</option>
                {FAILURE_PLACE_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectNative>
            </div>
          </Field>

          <Field label="Customer" error={errors.customerId?.message}>
            <SelectNative {...register("customerId")}>
              <option value="">Tidak ditentukan</option>
              {masters.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </SelectNative>
          </Field>

          <Field label="Contact Person" error={errors.contactPerson?.message} required>
            <Input {...register("contactPerson")} />
          </Field>

          <Field label="Contact Email" error={errors.contactEmail?.message} required>
            <Input type="email" {...register("contactEmail")} />
          </Field>

          <Field label="Contact Phone" error={errors.contactPhone?.message} required>
            <Input {...register("contactPhone")} />
          </Field>

          <Field label="Part Name" error={errors.partName?.message} required>
            <Input {...register("partName")} />
          </Field>

          <Field label="Internal Part No." error={errors.internalPartNo?.message} required>
            <Input {...register("internalPartNo")} />
          </Field>

          <Field label="Customer Part No." error={errors.customerPartNo?.message} required>
            <Input {...register("customerPartNo")} />
          </Field>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <RadioField
            label="Product Category"
            name="productCategoryId"
            value={watch("productCategoryId")}
            onChange={(value) => setValue("productCategoryId", value, { shouldDirty: true })}
            options={masters.productCategories.map((item) => ({ value: item.id, label: item.name }))}
            error={errors.productCategoryId?.message}
          />

          <RadioField
            label="Occurrence"
            name="occurrence"
            value={watch("occurrence")}
            onChange={(value) => setValue("occurrence", value, { shouldDirty: true })}
            options={OCCURRENCES.map(([value, label]) => ({ value, label }))}
            error={errors.occurrence?.message}
          />
        </div>

        <div className="mt-5 space-y-3">
          <RadioField
            label="Production Place / Origin Plant"
            name="originPlantType"
            value={originPlantType}
            onChange={(value) => setValue("originPlantType", value, { shouldDirty: true })}
            options={ORIGIN_PLANTS.map(([value, label]) => ({ value, label }))}
            error={errors.originPlantType?.message}
            columns={3}
          />

          {needsPlantDetail ? (
            <Field
              label={originPlantType === "PASSTHROUGH" ? "Nama plant" : "Nama vendor / sub-contractor"}
              error={errors.originPlantDetail?.message}
              required
            >
              <Input {...register("originPlantDetail")} />
            </Field>
          ) : null}
        </div>

        <div className="mt-5">
          <RadioField
            label="Non-Conformance Detail"
            name="ncDetailId"
            value={watch("ncDetailId")}
            onChange={(value) => setValue("ncDetailId", value, { shouldDirty: true })}
            options={masters.ncDetails.map((item) => ({ value: item.id, label: item.name }))}
            error={errors.ncDetailId?.message}
            columns={3}
          />
        </div>
      </Section>

      <Section title="B. Abnormal Description">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Abnormal Information Source" error={errors.abnormalSource?.message} required>
            <Input {...register("abnormalSource")} />
          </Field>

          <Field label="Suspected Process Line" error={errors.suspectedProcessLine?.message} required>
            <Input {...register("suspectedProcessLine")} />
          </Field>

          <Field label="Lot No." error={errors.lotNo?.message} required>
            <Input {...register("lotNo")} />
          </Field>

          <Field label="Kanban No." error={errors.kanbanNo?.message} required>
            <Input {...register("kanbanNo")} />
          </Field>

          <Field label="Injection Date" error={errors.injectionDate?.message}>
            <Input type="date" {...register("injectionDate")} />
          </Field>

          <Field label="Assembly Date" error={errors.assemblyDate?.message}>
            <Input type="date" {...register("assemblyDate")} />
          </Field>

          <Field label="Delivery Date" error={errors.deliveryDate?.message}>
            <Input type="date" {...register("deliveryDate")} />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Quality Problem" error={errors.qualityProblem?.message} required>
            <Textarea rows={4} {...register("qualityProblem")} />
          </Field>
        </div>
      </Section>

      <Section
        title="C. Part Comparison"
        description="Dua panel berdampingan. Panel Actual wajib memuat minimal satu foto sebelum klaim dikirim."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <PartPanel
            claimId={claimId}
            side="STANDARD"
            title="Standard Part"
            register={register as UseFormRegister<ClaimFormValues>}
            errors={errors}
            photos={photos.standard}
          />
          <PartPanel
            claimId={claimId}
            side="ACTUAL"
            title="Actual"
            register={register as UseFormRegister<ClaimFormValues>}
            errors={errors}
            photos={photos.actual}
          />
        </div>
      </Section>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-nid-border bg-card/95 px-1 py-3 backdrop-blur">
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
          Submit claim information
        </Button>

        <Button type="button" variant="outline" onClick={() => void persistDraft(false)} disabled={isSaving}>
          {isSaving ? <Loader2 aria-hidden className="animate-spin" /> : <Save aria-hidden />}
          Save draft
        </Button>

        <span aria-live="polite" className="text-xs text-muted-foreground">
          {isSaving
            ? "Menyimpan…"
            : savedAt
              ? `Tersimpan otomatis pukul ${savedAt}`
              : "Draft tersimpan otomatis tiap 30 detik."}
        </span>
      </div>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Field({
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

function RadioField({
  label,
  name,
  value,
  onChange,
  options,
  error,
  columns = 1,
}: {
  label?: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string; hint?: string }[];
  error?: string;
  columns?: 1 | 2 | 3;
}) {
  return (
    <fieldset className="space-y-2">
      {label ? (
        <legend className="mb-2 text-sm font-medium">
          {label}
          <span className="ml-0.5 text-destructive">*</span>
        </legend>
      ) : null}

      <RadioGroup
        name={name}
        value={value}
        onValueChange={onChange}
        className={cn(
          columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
          columns === 2 && "sm:grid-cols-2",
        )}
      >
        {options.map((option) => (
          <RadioGroupItem key={option.value} value={option.value}>
            <span className="block font-medium">{option.label}</span>
            {option.hint ? (
              <span className="mt-0.5 block text-xs text-muted-foreground">{option.hint}</span>
            ) : null}
          </RadioGroupItem>
        ))}
      </RadioGroup>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </fieldset>
  );
}

export type { FieldErrors };
