"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  TEMPORARY_ACTION_TEMPLATES,
  type TemporaryActionEntry,
  type TemporaryActionInput,
  type TemporaryActionKind,
  blankEntry,
  templateFor,
} from "@/schemas/temporary-action";
import { saveCparTemporaryAction } from "@/server/actions/cpar-filling";

/** Bentuk baris selama diedit: setiap angka masih berupa teks dari input. */
interface DraftEntry {
  readonly id: string;
  kind: TemporaryActionKind;
  label: string;
  totalPcs: string;
  totalBags: string;
  okPcs: string;
  ngPcs: string;
  performedOn: string;
  note: string;
}

let rowCounter = 0;

function toDraft(entry: TemporaryActionEntry): DraftEntry {
  rowCounter += 1;

  return {
    id: `row-${rowCounter}`,
    kind: entry.kind,
    label: entry.label,
    totalPcs: entry.totalPcs?.toString() ?? "",
    totalBags: entry.totalBags?.toString() ?? "",
    okPcs: entry.okPcs?.toString() ?? "",
    ngPcs: entry.ngPcs?.toString() ?? "",
    performedOn: entry.performedOn ?? "",
    note: entry.note ?? "",
  };
}

/**
 * Temporary Corrective Action — tabel yang jumlah barisnya dapat diatur.
 *
 * Tiga template disediakan karena ketiganya hampir selalu muncul: penggantian part,
 * sortir stok di pelanggan, dan sortir stok sendiri. Template hanya mengisi judul dan
 * menentukan kolom mana yang relevan; judulnya tetap dapat diubah, sehingga satu jenis
 * bisa dipakai lebih dari sekali — misalnya dua gelombang sortir di pelanggan.
 */
export function TemporaryActionEditor({
  claimId,
  value,
  canFill,
  locked,
  legacyText,
}: {
  claimId: string;
  value: TemporaryActionInput;
  canFill: boolean;
  locked: boolean;
  /**
   * Isi paragraf yang ditulis sebelum section ini menjadi tabel.
   *
   * Tetap ditampilkan selama tabelnya masih kosong: section yang sudah diisi orang
   * tidak boleh berubah menjadi "Belum diisi" hanya karena bentuk penyimpanannya
   * berganti.
   */
  legacyText?: string | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<DraftEntry[]>(() => value.entries.map(toDraft));
  const [note, setNote] = useState(value.note ?? "");
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  function update(id: string, patch: Partial<DraftEntry>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function add(kind: TemporaryActionKind) {
    setRows((current) => [...current, toDraft(blankEntry(kind))]);
    setEditing(true);
  }

  function remove(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
  }

  function reset() {
    setRows(value.entries.map(toDraft));
    setNote(value.note ?? "");
    setErrors({});
    setEditing(false);
  }

  async function save() {
    setErrors({});
    setSaving(true);

    try {
      const result = await saveCparTemporaryAction(claimId, {
        entries: rows.map((row) => ({
          kind: row.kind,
          label: row.label,
          totalPcs: row.totalPcs,
          totalBags: row.totalBags,
          okPcs: row.okPcs,
          ngPcs: row.ngPcs,
          performedOn: row.performedOn,
          note: row.note,
        })),
        note,
      });

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error("Gagal menyimpan", { description: result.message });
        return;
      }

      toast.success("Tindakan penahan tersimpan", { description: result.message });
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <TemporaryActionView
        value={value}
        canEdit={canFill && !locked}
        legacyText={legacyText}
        onEdit={() => setEditing(true)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-nid-border px-3 py-6 text-center text-sm text-muted-foreground">
          Belum ada baris. Tambahkan dari template di bawah.
        </p>
      ) : (
        <ol className="space-y-3">
          {rows.map((row, index) => (
            <li key={row.id}>
              <RowEditor
                row={row}
                index={index}
                errors={errors}
                onChange={(patch) => update(row.id, patch)}
                onRemove={() => remove(row.id)}
              />
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap gap-2">
        {TEMPORARY_ACTION_TEMPLATES.map((template) => (
          <Button
            key={template.kind}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => add(template.kind)}
          >
            <Plus aria-hidden />
            {template.label}
          </Button>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ta-note">Catatan tambahan (opsional)</Label>
        <Textarea
          id="ta-note"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Keterangan yang tidak muat di baris mana pun, misalnya kesepakatan dengan pelanggan."
        />
        <FieldError messages={errors.note} />
      </div>

      <FieldError messages={errors._form ?? errors.entries} />

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

function RowEditor({
  row,
  index,
  errors,
  onChange,
  onRemove,
}: {
  row: DraftEntry;
  index: number;
  errors: Record<string, string[]>;
  onChange: (patch: Partial<DraftEntry>) => void;
  onRemove: () => void;
}) {
  const template = templateFor(row.kind);
  const errorFor = (field: string) => errors[`entries.${index}.${field}`];

  return (
    <div className="rounded-lg border border-nid-border p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <Input
            aria-label={`Judul baris ${index + 1}`}
            value={row.label}
            onChange={(event) => onChange({ label: event.target.value })}
          />
          <p className="text-xs text-muted-foreground">{template.hint}</p>
          <FieldError messages={errorFor("label")} />
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

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <NumberField
          label={template.tracksResult ? "Total sortir (pcs)" : "Jumlah (pcs)"}
          value={row.totalPcs}
          onChange={(value) => onChange({ totalPcs: value })}
          error={errorFor("totalPcs")}
        />
        <NumberField
          label={template.tracksResult ? "Total sortir (bags)" : "Jumlah (bags)"}
          value={row.totalBags}
          onChange={(value) => onChange({ totalBags: value })}
          error={errorFor("totalBags")}
        />

        {template.tracksResult ? (
          <>
            <NumberField
              label="Hasil OK (pcs)"
              value={row.okPcs}
              onChange={(value) => onChange({ okPcs: value })}
              error={errorFor("okPcs")}
            />
            <NumberField
              label="Hasil NG (pcs)"
              value={row.ngPcs}
              onChange={(value) => onChange({ ngPcs: value })}
              error={errorFor("ngPcs")}
            />
          </>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[12rem_1fr]">
        <TextField
          label="Tanggal / periode"
          value={row.performedOn}
          placeholder="18–19 Okt 2026"
          onChange={(value) => onChange({ performedOn: value })}
        />
        <TextField
          label="Keterangan"
          value={row.note}
          placeholder="Lokasi, pelaksana, atau catatan lain untuk baris ini."
          onChange={(value) => onChange({ note: value })}
        />
      </div>
    </div>
  );
}

/**
 * Label dan input dipasangkan lewat id yang dibangkitkan.
 *
 * Tanpa pasangan itu pembaca layar hanya mengumumkan "spin button" tanpa menyebut
 * kolomnya, dan mengetuk labelnya tidak memindahkan fokus — pada tabel berisi empat
 * kolom angka yang mirip, keduanya cukup untuk membuat salah isi.
 */
function NumberField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: readonly string[];
}) {
  const id = useId();

  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldError messages={error} />
    </div>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const id = useId();

  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
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

/** Tampilan baca: tabel ringkas yang dapat dipindai, bukan daftar formulir. */
export function TemporaryActionView({
  value,
  canEdit,
  legacyText,
  onEdit,
}: {
  value: TemporaryActionInput;
  canEdit: boolean;
  legacyText?: string | null;
  onEdit?: () => void;
}) {
  if (value.entries.length === 0) {
    const legacy = (legacyText ?? "").trim();

    return (
      <div className="space-y-3">
        {legacy ? (
          <>
            <p className="whitespace-pre-line break-words text-sm">{legacy}</p>
            <p className="text-xs text-muted-foreground">
              Ditulis sebagai paragraf sebelum section ini menjadi tabel. Isi ulang sebagai baris
              agar angkanya dapat dijumlahkan dan ikut tercetak pada tabel CPAR.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Belum diisi.</p>
        )}

        {canEdit && onEdit ? (
          <Button type="button" size="sm" variant="outline" onClick={onEdit}>
            <Plus aria-hidden />
            {legacy ? "Isi sebagai tabel" : "Isi tindakan penahan"}
          </Button>
        ) : null}
      </div>
    );
  }

  const tracksResult = value.entries.some((entry) => templateFor(entry.kind).tracksResult);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-nid-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-1.5 pr-3 font-medium">Tindakan</th>
              <th className="py-1.5 pr-3 text-right font-medium">Pcs</th>
              <th className="py-1.5 pr-3 text-right font-medium">Bags</th>
              {tracksResult ? (
                <>
                  <th className="py-1.5 pr-3 text-right font-medium">OK</th>
                  <th className="py-1.5 pr-3 text-right font-medium">NG</th>
                </>
              ) : null}
              <th className="py-1.5 font-medium">Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {value.entries.map((entry, index) => (
              <tr key={`${entry.kind}-${index}`} className="border-b border-nid-border last:border-0">
                <td className="py-2 pr-3 align-top">
                  <div className="font-medium">{entry.label}</div>
                  {entry.performedOn ? (
                    <div className="text-xs text-muted-foreground">{entry.performedOn}</div>
                  ) : null}
                </td>
                <td className="py-2 pr-3 text-right align-top tabular">{entry.totalPcs ?? "—"}</td>
                <td className="py-2 pr-3 text-right align-top tabular">{entry.totalBags ?? "—"}</td>
                {tracksResult ? (
                  <>
                    <td className="py-2 pr-3 text-right align-top tabular">
                      {templateFor(entry.kind).tracksResult ? (entry.okPcs ?? "—") : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right align-top tabular">
                      {templateFor(entry.kind).tracksResult ? (entry.ngPcs ?? "—") : "—"}
                    </td>
                  </>
                ) : null}
                <td className="py-2 align-top text-muted-foreground">{entry.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {value.note ? <p className="whitespace-pre-line break-words text-sm">{value.note}</p> : null}

      {canEdit && onEdit ? (
        <Button type="button" size="sm" variant="outline" onClick={onEdit}>
          Ubah
        </Button>
      ) : null}
    </div>
  );
}
