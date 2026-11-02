"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Pencil, Plus, Power, X } from "lucide-react";

import { ROLE_LABEL } from "@/config/navigation";
import type { RoleCode } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CatalogDefinition } from "@/lib/master-catalog";
import { ROLE_CODES } from "@/schemas/master";
import { saveCatalogEntry, setCatalogEntryActive } from "@/server/actions/master";

export interface CatalogRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly extra: string | null;
  readonly roleCodes: readonly RoleCode[];
  readonly extraEmails: readonly string[];
  readonly isActive: boolean;
  /** Berapa kali baris ini sudah dipakai; menjelaskan akibat menonaktifkannya. */
  readonly usageCount: number;
  readonly usageLabel: string;
}

interface Draft {
  code: string;
  name: string;
  sortOrder: string;
  extra: string;
  roleCodes: RoleCode[];
  extraEmails: string;
  isActive: boolean;
}

function toDraft(row?: CatalogRow): Draft {
  return {
    code: row?.code ?? "",
    name: row?.name ?? "",
    sortOrder: String(row?.sortOrder ?? 0),
    extra: row?.extra ?? "",
    roleCodes: [...(row?.roleCodes ?? [])],
    extraEmails: (row?.extraEmails ?? []).join("\n"),
    isActive: row?.isActive ?? true,
  };
}

/**
 * Satu tampilan untuk keenam daftar acuan.
 *
 * Yang membedakannya datang dari `definition`: label kolom, ada tidaknya urutan tampil,
 * satu kolom tambahan pada part, dan pemilihan penerima pada grup email. Enam halaman
 * yang hampir sama akan berbeda-beda seiring waktu tanpa ada yang memutuskannya.
 */
export function CatalogManager({
  definition,
  rows,
}: {
  definition: CatalogDefinition;
  rows: readonly CatalogRow[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => toDraft());
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  function open(row?: CatalogRow) {
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
      const result = await saveCatalogEntry(
        definition.slug,
        editing === "new" ? null : editing,
        draft,
      );

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

  function toggle(row: CatalogRow) {
    startTransition(async () => {
      const result = await setCatalogEntryActive(definition.slug, row.id, !row.isActive);

      if (result.ok) {
        toast.success("Tersimpan", { description: result.message });
        router.refresh();
      } else {
        toast.error("Gagal", { description: result.message });
      }
    });
  }

  const form = (
    <CatalogForm
      definition={definition}
      draft={draft}
      errors={errors}
      saving={isPending}
      onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
      onSave={save}
      onCancel={close}
    />
  );

  return (
    <div className="space-y-3">
      {editing === "new" ? (
        form
      ) : (
        <Button type="button" size="sm" onClick={() => open()}>
          <Plus aria-hidden />
          Tambah {definition.title.toLowerCase()}
        </Button>
      )}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-nid-border px-3 py-8 text-center text-sm text-muted-foreground">
          Belum ada data.
        </p>
      ) : (
        <ul className="divide-y divide-nid-border rounded-lg border border-nid-border">
          {rows.map((row) => (
            <li key={row.id} className="px-4 py-3">
              {editing === row.id ? (
                form
              ) : (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {definition.hasSortOrder ? (
                    <span className="w-6 shrink-0 text-xs tabular text-muted-foreground">
                      {row.sortOrder}
                    </span>
                  ) : null}

                  <span className="w-44 shrink-0 truncate font-medium tabular">{row.code}</span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{row.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {definition.extraField && row.extra ? `${row.extra} · ` : ""}
                      {definition.hasRecipients
                        ? describeRecipients(row)
                        : `${row.usageCount} ${row.usageLabel}`}
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

function describeRecipients(row: CatalogRow): string {
  const parts = [
    row.roleCodes.length > 0 ? row.roleCodes.map((role) => ROLE_LABEL[role]).join(", ") : null,
    row.extraEmails.length > 0 ? `${row.extraEmails.length} alamat tambahan` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "belum ada penerima";
}

function CatalogForm({
  definition,
  draft,
  errors,
  saving,
  onChange,
  onSave,
  onCancel,
}: {
  definition: CatalogDefinition;
  draft: Draft;
  errors: Record<string, string[]>;
  saving: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const ids = {
    code: useId(),
    name: useId(),
    sortOrder: useId(),
    extra: useId(),
    emails: useId(),
    active: useId(),
  };

  return (
    <div className="space-y-3 rounded-lg border border-nid-border bg-secondary/40 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={ids.code} label={definition.codeLabel} error={errors.code}>
          <Input
            id={ids.code}
            value={draft.code}
            placeholder={definition.codePlaceholder}
            onChange={(event) => onChange({ code: event.target.value })}
          />
        </Field>

        <Field id={ids.name} label={definition.nameLabel} error={errors.name}>
          <Input
            id={ids.name}
            value={draft.name}
            placeholder={definition.namePlaceholder}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </Field>

        {definition.extraField ? (
          <Field id={ids.extra} label={definition.extraField.label} error={errors.extra}>
            <Input
              id={ids.extra}
              value={draft.extra}
              placeholder={definition.extraField.placeholder}
              onChange={(event) => onChange({ extra: event.target.value })}
            />
          </Field>
        ) : null}

        {definition.hasSortOrder ? (
          <Field
            id={ids.sortOrder}
            label="Urutan tampil (angka kecil lebih dulu)"
            error={errors.sortOrder}
          >
            <Input
              id={ids.sortOrder}
              type="number"
              inputMode="numeric"
              min={0}
              value={draft.sortOrder}
              onChange={(event) => onChange({ sortOrder: event.target.value })}
            />
          </Field>
        ) : null}
      </div>

      {definition.hasRecipients ? (
        <>
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium">Role penerima</legend>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
              {ROLE_CODES.map((role) => (
                <label key={role} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.roleCodes.includes(role)}
                    onChange={(event) =>
                      onChange({
                        roleCodes: event.target.checked
                          ? [...draft.roleCodes, role]
                          : draft.roleCodes.filter((entry) => entry !== role),
                      })
                    }
                    className="size-4 rounded border-input accent-nid-orange-700"
                  />
                  {ROLE_LABEL[role]}
                </label>
              ))}
            </div>
            <FieldError messages={errors.roleCodes} />
          </fieldset>

          <Field
            id={ids.emails}
            label="Alamat tambahan (satu per baris)"
            error={errors.extraEmails}
          >
            <Textarea
              id={ids.emails}
              rows={3}
              value={draft.extraEmails}
              placeholder={"qa-group@nifco.co.id\nmanagement@nifco.co.id"}
              onChange={(event) => onChange({ extraEmails: event.target.value })}
            />
          </Field>
        </>
      ) : null}

      <label htmlFor={ids.active} className="flex items-center gap-2 text-sm">
        <input
          id={ids.active}
          type="checkbox"
          checked={draft.isActive}
          onChange={(event) => onChange({ isActive: event.target.checked })}
          className="size-4 rounded border-input accent-nid-orange-700"
        />
        Aktif
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

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: readonly string[];
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {children}
      <FieldError messages={error} />
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
