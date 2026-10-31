"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Check, FileUp, Loader2, Plus, Trash2, UserRound } from "lucide-react";

import { submitUpload } from "@/components/shared/submit-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select-native";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  ACTION_PLAN_COPY,
  type ActionPlanCopy,
  type ActionPlanSectionKey,
} from "@/lib/cpar";
import { type ActionItem, type ActionPlanInput, blankItem } from "@/schemas/action-plan";
import {
  deleteCparEvidence,
  saveCparActionPlan,
  uploadActionItemEvidence,
} from "@/server/actions/cpar-filling";

/** Calon PIC, sudah diringkas halaman server menjadi apa yang perlu tampil di pilihan. */
export interface PicOption {
  readonly id: string;
  readonly name: string;
  readonly jobTitle: string;
  readonly departmentCode: string | null;
}

export interface ItemEvidence {
  readonly id: string;
  readonly originalName: string;
  readonly url: string;
  readonly uploadedByName: string;
  readonly uploadedAt: Date;
}

interface DraftItem {
  readonly key: string;
  /** Penanda baris yang sudah tersimpan; baris baru belum punya. */
  readonly id?: string;
  action: string;
  picId: string;
  implementedOn: string;
  note: string;
}

let rowCounter = 0;

function toDraft(item: ActionItem): DraftItem {
  rowCounter += 1;

  return {
    key: `cm-${rowCounter}`,
    id: item.id,
    action: item.action,
    picId: item.picId,
    implementedOn: item.implementedOn ?? "",
    note: item.note ?? "",
  };
}

/**
 * Daftar tindakan bertanggung jawab — dipakai permanent countermeasure maupun
 * standardization & horizontal deployment.
 *
 * Tiap baris membawa tiga hal yang ditanyakan verifier: apa yang dikerjakan, siapa yang
 * diminta mengerjakan, dan kapan diimplementasikan. Evidence menempel pada baris, bukan
 * pada section — satu foto jig baru adalah bukti bagi satu tindakan tertentu, dan
 * menumpuknya di daftar evidence umum membuat pembacanya harus menebak milik yang mana.
 *
 * Kata-katanya mengikuti sectionnya lewat ACTION_PLAN_COPY; bentuk isiannya sama.
 */
export function ActionPlanEditor({
  claimId,
  sectionKey,
  value,
  people,
  evidence,
  canFill,
  canUploadEvidence,
  locked,
  legacyText,
}: {
  claimId: string;
  sectionKey: ActionPlanSectionKey;
  value: ActionPlanInput;
  people: readonly PicOption[];
  /** Evidence per penanda baris. */
  evidence: Readonly<Record<string, readonly ItemEvidence[]>>;
  canFill: boolean;
  canUploadEvidence: boolean;
  locked: boolean;
  /** Paragraf yang ditulis sebelum section ini menjadi daftar; lihat TemporaryActionEditor. */
  legacyText?: string | null;
}) {
  const router = useRouter();
  const copy = ACTION_PLAN_COPY[sectionKey];
  const noteId = useId();
  const [rows, setRows] = useState<DraftItem[]>(() => value.items.map(toDraft));
  const [note, setNote] = useState(value.note ?? "");
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  /**
   * Draft disegarkan setiap data dari server berganti.
   *
   * `useState` hanya membaca nilai awalnya sekali, sedangkan `router.refresh()` mengganti
   * prop tanpa melepas komponennya. Tanpa penyegaran ini, baris yang baru ditambahkan
   * tetap memegang draft tanpa penanda walau server sudah memberinya satu — dan
   * penyimpanan berikutnya akan dianggap baris baru lagi: penandanya berganti, evidence
   * yang menempel padanya terlepas, dan PIC-nya dikabari untuk kedua kalinya.
   *
   * Penyegaran ditahan selama editor terbuka, supaya ketikan yang belum disimpan tidak
   * hilang ketika halaman kebetulan menyegarkan dirinya.
   */
  const [serverValue, setServerValue] = useState(value);

  if (serverValue !== value && !editing) {
    setServerValue(value);
    setRows(value.items.map(toDraft));
    setNote(value.note ?? "");
  }

  function update(key: string, patch: Partial<DraftItem>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function reset() {
    setRows(value.items.map(toDraft));
    setNote(value.note ?? "");
    setErrors({});
    setEditing(false);
  }

  async function save() {
    setErrors({});
    setSaving(true);

    try {
      const result = await saveCparActionPlan(claimId, {
        sectionKey,
        items: rows.map((row) => ({
          id: row.id,
          action: row.action,
          picId: row.picId,
          implementedOn: row.implementedOn,
          note: row.note,
        })),
        note,
      });

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error("Gagal menyimpan", { description: result.message });
        return;
      }

      toast.success(copy.savedTitle, { description: result.message });
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <ActionPlanView
        claimId={claimId}
        sectionKey={sectionKey}
        value={value}
        people={people}
        evidence={evidence}
        canEdit={canFill && !locked}
        canUploadEvidence={canUploadEvidence && !locked}
        legacyText={legacyText}
        onEdit={() => setEditing(true)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-nid-border px-3 py-6 text-center text-sm text-muted-foreground">
          {copy.emptyHint}
        </p>
      ) : (
        <ol className="space-y-3">
          {rows.map((row, index) => (
            <li key={row.key}>
              <ItemEditor
                row={row}
                index={index}
                copy={copy}
                people={people}
                errors={errors}
                evidenceCount={row.id ? (evidence[row.id]?.length ?? 0) : 0}
                onChange={(patch) => update(row.key, patch)}
                onRemove={() => setRows((current) => current.filter((r) => r.key !== row.key))}
              />
            </li>
          ))}
        </ol>
      )}

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setRows((current) => [...current, toDraft(blankItem())])}
      >
        <Plus aria-hidden />
        {copy.addLabel}
      </Button>

      <div className="space-y-1.5">
        <Label htmlFor={noteId}>Catatan tambahan (opsional)</Label>
        <Textarea
          id={noteId}
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={copy.notePlaceholder}
        />
        <FieldError messages={errors.note} />
      </div>

      <FieldError messages={errors._form ?? errors.items} />

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 aria-hidden className="animate-spin" /> : <Check aria-hidden />}
          Save update
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={reset}>
          Batal
        </Button>
      </div>
    </div>
  );
}

function ItemEditor({
  row,
  index,
  copy,
  people,
  errors,
  evidenceCount,
  onChange,
  onRemove,
}: {
  row: DraftItem;
  index: number;
  copy: ActionPlanCopy;
  people: readonly PicOption[];
  errors: Record<string, string[]>;
  evidenceCount: number;
  onChange: (patch: Partial<DraftItem>) => void;
  onRemove: () => void;
}) {
  const ids = { action: useId(), pic: useId(), date: useId(), note: useId() };
  const errorFor = (field: string) => errors[`items.${index}.${field}`];

  return (
    <div className="rounded-lg border border-nid-border p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor={ids.action} className="text-xs">
            {copy.itemLabel} {index + 1}
          </Label>
          <Textarea
            id={ids.action}
            rows={2}
            value={row.action}
            placeholder={copy.itemPlaceholder}
            onChange={(event) => onChange({ action: event.target.value })}
          />
          <FieldError messages={errorFor("action")} />
        </div>

        <button
          type="button"
          aria-label={`Hapus baris ${index + 1}`}
          onClick={onRemove}
          className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary"
        >
          <Trash2 aria-hidden className="size-4" />
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={ids.pic} className="text-xs">
            PIC yang diminta
          </Label>
          <SelectNative
            id={ids.pic}
            value={row.picId}
            onChange={(event) => onChange({ picId: event.target.value })}
          >
            <option value="">— Pilih PIC —</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
                {person.departmentCode ? ` · ${person.departmentCode}` : ""}
              </option>
            ))}
          </SelectNative>
          <FieldError messages={errorFor("picId")} />
        </div>

        <div className="space-y-1">
          <Label htmlFor={ids.date} className="text-xs">
            Tanggal implementasi
          </Label>
          <Input
            id={ids.date}
            type="date"
            value={row.implementedOn}
            onChange={(event) => onChange({ implementedOn: event.target.value })}
          />
          <p className="text-[11px] text-muted-foreground">
            Rencana bila masih di depan, realisasi bila sudah lewat.
          </p>
          <FieldError messages={errorFor("implementedOn")} />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor={ids.note} className="text-xs">
            Keterangan (opsional)
          </Label>
          <Input
            id={ids.note}
            value={row.note}
            placeholder="Nomor dokumen, biaya, atau catatan lain untuk baris ini."
            onChange={(event) => onChange({ note: event.target.value })}
          />
          <FieldError messages={errorFor("note")} />
        </div>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        {row.id
          ? evidenceCount > 0
            ? `${evidenceCount} evidence terlampir — kelola dari daftar setelah disimpan.`
            : "Evidence dilampirkan dari daftar setelah baris ini disimpan."
          : "Simpan dulu untuk dapat melampirkan evidence pada tindakan ini."}
      </p>
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

/** Tampilan baca: satu kartu per baris, lengkap dengan evidence-nya. */
export function ActionPlanView({
  claimId,
  sectionKey,
  value,
  people,
  evidence,
  canEdit,
  canUploadEvidence,
  legacyText,
  onEdit,
}: {
  claimId: string;
  sectionKey: ActionPlanSectionKey;
  value: ActionPlanInput;
  people: readonly PicOption[];
  evidence: Readonly<Record<string, readonly ItemEvidence[]>>;
  canEdit: boolean;
  canUploadEvidence: boolean;
  legacyText?: string | null;
  onEdit?: () => void;
}) {
  const copy = ACTION_PLAN_COPY[sectionKey];

  if (value.items.length === 0) {
    const legacy = (legacyText ?? "").trim();

    return (
      <div className="space-y-3">
        {legacy ? (
          <>
            <p className="whitespace-pre-line break-words text-sm">{legacy}</p>
            <p className="text-xs text-muted-foreground">
              Ditulis sebagai paragraf sebelum section ini menjadi daftar. Isi ulang sebagai
              baris agar PIC, tanggal implementasi, dan evidence-nya dapat ditelusuri.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Belum diisi.</p>
        )}

        {canEdit && onEdit ? (
          <Button type="button" size="sm" variant="outline" onClick={onEdit}>
            <Plus aria-hidden />
            {legacy ? "Isi sebagai daftar" : copy.startLabel}
          </Button>
        ) : null}
      </div>
    );
  }

  const nameById = new Map(people.map((person) => [person.id, person]));
  const undated = value.items.filter((item) => !(item.implementedOn ?? "").trim()).length;

  return (
    <div className="space-y-3">
      <ol className="space-y-3">
        {value.items.map((item, index) => {
          const pic = nameById.get(item.picId);

          return (
            <li
              key={item.id ?? index}
              className="rounded-lg border border-nid-border px-3 py-2.5"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold tabular">
                  {index + 1}
                </span>
                <p className="min-w-0 flex-1 whitespace-pre-line break-words text-sm">
                  {item.action}
                </p>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-8.5 text-xs">
                <span className="flex items-center gap-1.5">
                  <UserRound aria-hidden className="size-3.5 text-muted-foreground" />
                  {pic ? (
                    <>
                      {pic.name}
                      <span className="text-muted-foreground">
                        {pic.departmentCode ? `· ${pic.departmentCode}` : ""} {pic.jobTitle}
                      </span>
                    </>
                  ) : (
                    <span className="text-[var(--status-pending)]">PIC sudah tidak aktif</span>
                  )}
                </span>

                <span className="flex items-center gap-1.5">
                  <CalendarClock aria-hidden className="size-3.5 text-muted-foreground" />
                  {item.implementedOn ? (
                    formatDate(item.implementedOn)
                  ) : (
                    <span className="text-[var(--status-pending)]">Tanggal belum ditetapkan</span>
                  )}
                </span>
              </div>

              {item.note ? (
                <p className="mt-1 pl-8.5 text-xs text-muted-foreground break-words">{item.note}</p>
              ) : null}

              <div className="mt-2 pl-8.5">
                <ItemEvidencePanel
                  claimId={claimId}
                  itemId={item.id ?? null}
                  index={index}
                  files={item.id ? (evidence[item.id] ?? []) : []}
                  canUpload={canUploadEvidence}
                />
              </div>
            </li>
          );
        })}
      </ol>

      {undated > 0 ? (
        <p className="text-xs text-[var(--status-pending)]">
          {undated} baris belum punya tanggal implementasi.
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

/** Evidence satu tindakan: daftar berkas yang ada, plus unggahan bila berhak. */
function ItemEvidencePanel({
  claimId,
  itemId,
  index,
  files,
  canUpload,
}: {
  claimId: string;
  itemId: string | null;
  index: number;
  files: readonly ItemEvidence[];
  canUpload: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [isDeleting, startDelete] = useTransition();

  async function upload(file: File) {
    if (!itemId) return;
    setUploading(true);

    try {
      const sent = await submitUpload(
        file,
        (chosen) => {
          const formData = new FormData();
          formData.set("claimId", claimId);
          formData.set("itemId", itemId);
          formData.set("file", chosen);
          return formData;
        },
        uploadActionItemEvidence,
      );

      if (sent) router.refresh();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (files.length === 0 && !canUpload) return null;

  return (
    <div className="space-y-1.5">
      {files.length > 0 ? (
        <ul className="space-y-1">
          {files.map((file) => (
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
                  disabled={isDeleting}
                  onClick={() =>
                    startDelete(async () => {
                      const result = await deleteCparEvidence(file.id);
                      if (result.ok) router.refresh();
                      else toast.error("Hapus evidence gagal", { description: result.message });
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

      {canUpload && itemId ? (
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
            variant="ghost"
            size="sm"
            disabled={uploading}
            aria-label={`Upload evidence untuk baris ${index + 1}`}
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
