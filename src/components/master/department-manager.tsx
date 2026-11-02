"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Pencil, Plus, Power, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveDepartment, setDepartmentActive } from "@/server/actions/master";

export interface DepartmentRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly email: string | null;
  readonly isActive: boolean;
  /** Berapa pengguna yang bernaung di sini; menjelaskan akibat menonaktifkannya. */
  readonly userCount: number;
  readonly cparCount: number;
}

interface Draft {
  code: string;
  name: string;
  email: string;
  isActive: boolean;
}

function toDraft(row?: DepartmentRow): Draft {
  return {
    code: row?.code ?? "",
    name: row?.name ?? "",
    email: row?.email ?? "",
    isActive: row?.isActive ?? true,
  };
}

/**
 * Pengelolaan departemen.
 *
 * Tidak ada tombol hapus. Departemen tertinggal di klaim lama sebagai penanggung jawab
 * CPAR dan sebagai naungan orang yang menandatanganinya; menghapus barisnya akan
 * membuat lembar yang sudah disetujui kehilangan nama departemennya. Yang ada hanya
 * menonaktifkan — hilang dari pilihan baru, tetap terbaca pada yang lama.
 */
export function DepartmentManager({ rows }: { rows: readonly DepartmentRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => toDraft());
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  function open(row?: DepartmentRow) {
    setEditing(row?.id ?? "new");
    setDraft(toDraft(row));
    setErrors({});
  }

  function close() {
    setEditing(null);
    setErrors({});
  }

  function save() {
    startTransition(async () => {
      const result = await saveDepartment(editing === "new" ? null : editing, draft);

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error("Gagal menyimpan", { description: result.message });
        return;
      }

      toast.success("Tersimpan", { description: result.message });
      close();
      router.refresh();
    });
  }

  function toggle(row: DepartmentRow) {
    startTransition(async () => {
      const result = await setDepartmentActive(row.id, !row.isActive);

      if (result.ok) {
        toast.success("Tersimpan", { description: result.message });
        router.refresh();
      } else {
        toast.error("Gagal", { description: result.message });
      }
    });
  }

  return (
    <div className="space-y-3">
      {editing === "new" ? (
        <DepartmentForm
          draft={draft}
          errors={errors}
          saving={isPending}
          onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          onSave={save}
          onCancel={close}
        />
      ) : (
        <Button type="button" size="sm" onClick={() => open()}>
          <Plus aria-hidden />
          Tambah departemen
        </Button>
      )}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-nid-border px-3 py-8 text-center text-sm text-muted-foreground">
          Belum ada departemen.
        </p>
      ) : (
        <ul className="divide-y divide-nid-border rounded-lg border border-nid-border">
          {rows.map((row) => (
            <li key={row.id} className="px-4 py-3">
              {editing === row.id ? (
                <DepartmentForm
                  draft={draft}
                  errors={errors}
                  saving={isPending}
                  onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
                  onSave={save}
                  onCancel={close}
                />
              ) : (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="w-16 shrink-0 font-medium tabular">{row.code}</span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{row.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.email || "tanpa alamat grup"} · {row.userCount} pengguna ·{" "}
                      {row.cparCount} CPAR
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      row.isActive
                        ? "bg-[var(--status-closed-bg)] text-[var(--status-closed)]"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {row.isActive ? "Aktif" : "Nonaktif"}
                  </span>

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => open(row)}
                  >
                    <Pencil aria-hidden />
                    Ubah
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => toggle(row)}
                  >
                    <Power aria-hidden />
                    {row.isActive ? "Nonaktifkan" : "Aktifkan"}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DepartmentForm({
  draft,
  errors,
  saving,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Draft;
  errors: Record<string, string[]>;
  saving: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const ids = { code: useId(), name: useId(), email: useId(), active: useId() };

  return (
    <div className="space-y-3 rounded-lg border border-nid-border bg-secondary/40 p-3">
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr_1fr]">
        <div className="space-y-1">
          <Label htmlFor={ids.code} className="text-xs">
            Kode
          </Label>
          <Input
            id={ids.code}
            value={draft.code}
            placeholder="PRD"
            onChange={(event) => onChange({ code: event.target.value })}
          />
          <FieldError messages={errors.code} />
        </div>

        <div className="space-y-1">
          <Label htmlFor={ids.name} className="text-xs">
            Nama departemen
          </Label>
          <Input
            id={ids.name}
            value={draft.name}
            placeholder="Production"
            onChange={(event) => onChange({ name: event.target.value })}
          />
          <FieldError messages={errors.name} />
        </div>

        <div className="space-y-1">
          <Label htmlFor={ids.email} className="text-xs">
            Alamat grup (opsional)
          </Label>
          <Input
            id={ids.email}
            type="email"
            value={draft.email}
            placeholder="production@nifco.co.id"
            onChange={(event) => onChange({ email: event.target.value })}
          />
          <FieldError messages={errors.email} />
        </div>
      </div>

      <label htmlFor={ids.active} className="flex items-center gap-2 text-sm">
        <input
          id={ids.active}
          type="checkbox"
          checked={draft.isActive}
          onChange={(event) => onChange({ isActive: event.target.checked })}
          className="size-4 rounded border-input accent-nid-orange-700"
        />
        Aktif — muncul sebagai pilihan saat menerbitkan CPAR
      </label>

      <FieldError messages={errors._form} />

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={saving} onClick={onSave}>
          {saving ? <Loader2 aria-hidden className="animate-spin" /> : <Check aria-hidden />}
          Simpan
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={onCancel}>
          <X aria-hidden />
          Batal
        </Button>
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
