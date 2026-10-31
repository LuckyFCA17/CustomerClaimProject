"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Check, ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_FLOW,
  type ProcessFlowInput,
  type ProcessStep,
  blankStep,
  flowCompleteness,
} from "@/schemas/process-flow";
import { saveCparProcessFlow } from "@/server/actions/cpar-filling";

interface DraftStep extends ProcessStep {
  readonly id: string;
}

let stepCounter = 0;

function toDraft(step: ProcessStep): DraftStep {
  stepCounter += 1;

  return { ...step, id: `step-${stepCounter}` };
}

/**
 * Process flow diagram — urutan proses beserta proses yang dicurigai.
 *
 * Dua tanda per proses, bukan satu: sebuah cacat terbentuk di satu proses dan lolos di
 * proses lain yang seharusnya menahannya, dan keduanya dapat jatuh pada proses yang
 * sama. Menandainya di sini membuat kedua analisis berikutnya punya sasaran yang jelas.
 */
export function ProcessFlowEditor({
  claimId,
  value,
  canFill,
  locked,
  legacyText,
}: {
  claimId: string;
  value: ProcessFlowInput;
  canFill: boolean;
  locked: boolean;
  legacyText?: string | null;
}) {
  const router = useRouter();
  const [steps, setSteps] = useState<DraftStep[]>(() => value.steps.map(toDraft));
  const [note, setNote] = useState(value.note ?? "");
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  const draftCompleteness = flowCompleteness({ steps, note });

  function update(id: string, patch: Partial<ProcessStep>) {
    setSteps((current) => current.map((step) => (step.id === id ? { ...step, ...patch } : step)));
  }

  function move(index: number, delta: number) {
    setSteps((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;

      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];

      return next;
    });
  }

  async function save() {
    setErrors({});
    setSaving(true);

    try {
      const result = await saveCparProcessFlow(claimId, {
        // `id` hanya kunci React selama diedit; yang disimpan adalah urutannya.
        steps: steps.map((step) => ({
          name: step.name,
          detail: step.detail,
          suspectOccurrence: step.suspectOccurrence,
          suspectOutflow: step.suspectOutflow,
        })),
        note,
      });

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error("Gagal menyimpan", { description: result.message });
        return;
      }

      toast.success("Diagram alur tersimpan", { description: result.message });
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <ProcessFlowView
        value={value}
        canEdit={canFill && !locked}
        legacyText={legacyText}
        onEdit={() => setEditing(true)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {steps.length === 0 ? (
        <div className="space-y-3 rounded-lg border border-dashed border-nid-border px-3 py-6 text-center">
          <p className="text-sm text-muted-foreground">Belum ada proses.</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setSteps(DEFAULT_FLOW.map((name) => toDraft({ ...blankStep(), name })))}
          >
            Pakai alur umum NID
          </Button>
        </div>
      ) : (
        <ol className="space-y-2">
          {steps.map((step, index) => (
            <li key={step.id}>
              <StepEditor
                step={step}
                index={index}
                total={steps.length}
                errors={errors}
                onChange={(patch) => update(step.id, patch)}
                onMove={(delta) => move(index, delta)}
                onRemove={() => setSteps((current) => current.filter((s) => s.id !== step.id))}
              />
            </li>
          ))}
        </ol>
      )}

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setSteps((current) => [...current, toDraft(blankStep())])}
      >
        <Plus aria-hidden />
        Tambah proses
      </Button>

      {draftCompleteness.missing.length > 0 ? (
        <p className="rounded-md bg-[var(--status-pending-bg)] px-3 py-2 text-sm text-[var(--status-pending)]">
          Diagram belum lengkap: {draftCompleteness.missing.join(", ")}. Tetap dapat disimpan,
          tetapi submit final akan menunggunya.
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="flow-note">Catatan alur (opsional)</Label>
        <Textarea
          id="flow-note"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Mis. proses inspeksi dilewati pada shift malam karena operator rangkap."
        />
        <FieldError messages={errors.note} />
      </div>

      <FieldError messages={errors._form ?? errors.steps} />

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 aria-hidden className="animate-spin" /> : <Check aria-hidden />}
          Save update
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={saving}
          onClick={() => {
            setSteps(value.steps.map(toDraft));
            setNote(value.note ?? "");
            setErrors({});
            setEditing(false);
          }}
        >
          Batal
        </Button>
      </div>
    </div>
  );
}

function StepEditor({
  step,
  index,
  total,
  errors,
  onChange,
  onMove,
  onRemove,
}: {
  step: DraftStep;
  index: number;
  total: number;
  errors: Record<string, string[]>;
  onChange: (patch: Partial<ProcessStep>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const nameId = useId();
  const detailId = useId();

  return (
    <div className="rounded-lg border border-nid-border p-3">
      <div className="flex items-start gap-2">
        <span className="mt-2 grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold tabular">
          {index + 1}
        </span>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-1">
            <Label htmlFor={nameId} className="sr-only">
              Nama proses {index + 1}
            </Label>
            <Input
              id={nameId}
              value={step.name}
              placeholder="Nama proses, mis. Injection"
              onChange={(event) => onChange({ name: event.target.value })}
            />
            <FieldError messages={errors[`steps.${index}.name`]} />
          </div>

          <div className="space-y-1">
            <Label htmlFor={detailId} className="sr-only">
              Keterangan proses {index + 1}
            </Label>
            <Input
              id={detailId}
              value={step.detail ?? ""}
              placeholder="Keterangan singkat (opsional), mis. mesin 4, cavity 1–8"
              onChange={(event) => onChange({ detail: event.target.value })}
            />
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2 pt-0.5">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={step.suspectOccurrence}
                onCheckedChange={(checked) => onChange({ suspectOccurrence: checked === true })}
              />
              Suspek <strong className="font-medium">occurrence</strong>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={step.suspectOutflow}
                onCheckedChange={(checked) => onChange({ suspectOutflow: checked === true })}
              />
              Suspek <strong className="font-medium">outflow</strong>
            </label>
          </div>
        </div>

        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            aria-label={`Naikkan proses ${index + 1}`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary disabled:opacity-30"
          >
            <ChevronUp aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            aria-label={`Turunkan proses ${index + 1}`}
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary disabled:opacity-30"
          >
            <ChevronDown aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            aria-label={`Hapus proses ${index + 1}`}
            onClick={onRemove}
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary"
          >
            <Trash2 aria-hidden className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldError({ messages }: { messages?: readonly string[] }) {
  if (!messages?.length) return null;

  return (
    <p role="alert" className="text-xs text-destructive">
      {messages[0]}
    </p>
  );
}

const SUSPECT_STYLE = {
  occurrence: {
    chip: "bg-[var(--status-danger-bg)] text-[var(--status-danger)]",
    box: "border-[var(--status-danger)]",
  },
  outflow: {
    chip: "bg-[var(--status-pending-bg)] text-[var(--status-pending)]",
    box: "border-[var(--status-pending)]",
  },
} as const;

/**
 * Tampilan baca: rangkaian kotak proses dengan panah di antaranya.
 *
 * Proses suspek diberi garis tepi berwarna sekaligus label teksnya, bukan warna saja —
 * occurrence dan outflow harus tetap terbedakan tanpa membedakan warna, dan tetap
 * terbaca ketika lembarnya dicetak hitam putih.
 */
export function ProcessFlowView({
  value,
  canEdit,
  legacyText,
  onEdit,
}: {
  value: ProcessFlowInput;
  canEdit: boolean;
  legacyText?: string | null;
  onEdit?: () => void;
}) {
  if (value.steps.length === 0) {
    const legacy = (legacyText ?? "").trim();

    return (
      <div className="space-y-3">
        {legacy ? (
          <p className="whitespace-pre-line break-words text-sm">{legacy}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Belum diisi.</p>
        )}
        {canEdit && onEdit ? (
          <Button type="button" size="sm" variant="outline" onClick={onEdit}>
            <Plus aria-hidden />
            Gambar alur proses
          </Button>
        ) : null}
      </div>
    );
  }

  const completeness = flowCompleteness(value);

  return (
    <div className="space-y-3">
      <ol className="flex flex-wrap items-stretch gap-y-2">
        {/* Panah digambar di depan tiap proses, bukan di belakangnya: pada rangkaian
            yang membungkus ke baris berikutnya, panah di belakang proses terakhir satu
            baris akan menunjuk ke ruang kosong, sedangkan panah di depan terbaca
            sebagai sambungan. */}
        {value.steps.map((step, index) => (
          <li key={`${step.name}-${index}`} className="flex items-center">
            {index > 0 ? (
              <ArrowRight aria-hidden className="mx-1 size-4 shrink-0 text-muted-foreground" />
            ) : null}
            <StepBox step={step} index={index} />
          </li>
        ))}
      </ol>

      {completeness.missing.length > 0 ? (
        <p className="text-xs text-[var(--status-pending)]">
          Belum lengkap: {completeness.missing.join(", ")}.
        </p>
      ) : null}

      {value.note ? <p className="whitespace-pre-line break-words text-sm">{value.note}</p> : null}

      {canEdit && onEdit ? (
        <Button type="button" size="sm" variant="outline" onClick={onEdit}>
          Ubah
        </Button>
      ) : null}
    </div>
  );
}

function StepBox({ step, index }: { step: ProcessStep; index: number }) {
  const border = step.suspectOccurrence
    ? SUSPECT_STYLE.occurrence.box
    : step.suspectOutflow
      ? SUSPECT_STYLE.outflow.box
      : "border-nid-border";

  return (
    <div className={`min-w-[8rem] max-w-[12rem] rounded-lg border-2 px-2.5 py-1.5 ${border}`}>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[11px] tabular text-muted-foreground">{index + 1}</span>
        <span className="min-w-0 break-words text-sm font-medium">{step.name}</span>
      </div>

      {step.detail ? (
        <p className="mt-0.5 break-words text-[11px] leading-tight text-muted-foreground">
          {step.detail}
        </p>
      ) : null}

      {step.suspectOccurrence || step.suspectOutflow ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {step.suspectOccurrence ? (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SUSPECT_STYLE.occurrence.chip}`}>
              occurrence
            </span>
          ) : null}
          {step.suspectOutflow ? (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SUSPECT_STYLE.outflow.chip}`}>
              outflow
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
