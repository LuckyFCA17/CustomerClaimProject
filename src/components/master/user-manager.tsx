"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, KeyRound, Loader2, Pencil, Plus, X } from "lucide-react";

import { ROLE_LABEL } from "@/config/navigation";
import type { RoleCode } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select-native";
import { PASSWORD_MIN, ROLE_CODES } from "@/schemas/master";
import { createUser, resetUserPassword, updateUser } from "@/server/actions/master";

export interface UserRow {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly jobTitle: string;
  readonly employeeNo: string | null;
  readonly departmentId: string | null;
  readonly departmentCode: string | null;
  readonly roles: readonly RoleCode[];
  readonly isActive: boolean;
}

export interface DepartmentOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly isActive: boolean;
}

interface Draft {
  name: string;
  email: string;
  jobTitle: string;
  employeeNo: string;
  departmentId: string;
  roles: RoleCode[];
  isActive: boolean;
  password: string;
}

function toDraft(row?: UserRow): Draft {
  return {
    name: row?.name ?? "",
    email: row?.email ?? "",
    jobTitle: row?.jobTitle ?? "",
    employeeNo: row?.employeeNo ?? "",
    departmentId: row?.departmentId ?? "",
    roles: [...(row?.roles ?? [])],
    isActive: row?.isActive ?? true,
    password: "",
  };
}

/**
 * Pengelolaan pengguna dan rolenya.
 *
 * Role di sini bukan sekadar label: ia menentukan siapa boleh memutuskan apa, dan satu
 * centang yang keliru mengubah rantai verifikasi sebuah CPAR. Karena itu rolenya
 * ditampilkan apa adanya sebagai daftar centang — bukan disembunyikan di balik "tingkat
 * akses" yang harus ditebak artinya.
 *
 * Tidak ada tombol hapus: nama pengguna tertinggal pada klaim yang ia buat dan pada
 * blok tanda tangan yang ia setujui. Yang ada hanya menonaktifkan.
 */
export function UserManager({
  rows,
  departments,
}: {
  rows: readonly UserRow[];
  departments: readonly DepartmentOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => toDraft());
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  function open(row?: UserRow) {
    setEditing(row?.id ?? "new");
    setResetting(null);
    setDraft(toDraft(row));
    setErrors({});
  }

  function close() {
    setEditing(null);
    setResetting(null);
    setErrors({});
  }

  function save() {
    startTransition(async () => {
      const result =
        editing === "new"
          ? await createUser(draft)
          : await updateUser({ ...draft, id: editing });

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

  function submitReset(id: string) {
    startTransition(async () => {
      const result = await resetUserPassword({ id, password });

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error("Gagal mengganti", { description: result.message });
        return;
      }

      toast.success("Kata sandi diganti", { description: result.message });
      setPassword("");
      setResetting(null);
      setErrors({});
    });
  }

  return (
    <div className="space-y-3">
      {editing === "new" ? (
        <UserForm
          draft={draft}
          departments={departments}
          errors={errors}
          saving={isPending}
          withPassword
          onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          onSave={save}
          onCancel={close}
        />
      ) : (
        <Button type="button" size="sm" onClick={() => open()}>
          <Plus aria-hidden />
          Tambah pengguna
        </Button>
      )}

      <ul className="divide-y divide-nid-border rounded-lg border border-nid-border">
        {rows.map((row) => (
          <li key={row.id} className="px-4 py-3">
            {editing === row.id ? (
              <UserForm
                draft={draft}
                departments={departments}
                errors={errors}
                saving={isPending}
                onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
                onSave={save}
                onCancel={close}
              />
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {row.name}
                      {row.departmentCode ? (
                        <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-normal">
                          {row.departmentCode}
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.email} · {row.jobTitle}
                      {row.employeeNo ? ` · NIK ${row.employeeNo}` : ""}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {row.roles.map((role) => ROLE_LABEL[role]).join(", ")}
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
                    onClick={() => {
                      setResetting(resetting === row.id ? null : row.id);
                      setPassword("");
                      setErrors({});
                    }}
                  >
                    <KeyRound aria-hidden />
                    Kata sandi
                  </Button>
                </div>

                {resetting === row.id ? (
                  <PasswordReset
                    value={password}
                    errors={errors}
                    saving={isPending}
                    onChange={setPassword}
                    onSubmit={() => submitReset(row.id)}
                    onCancel={() => {
                      setResetting(null);
                      setPassword("");
                    }}
                  />
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function UserForm({
  draft,
  departments,
  errors,
  saving,
  withPassword = false,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Draft;
  departments: readonly DepartmentOption[];
  errors: Record<string, string[]>;
  saving: boolean;
  withPassword?: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const ids = {
    name: useId(),
    email: useId(),
    jobTitle: useId(),
    employeeNo: useId(),
    department: useId(),
    password: useId(),
    active: useId(),
  };

  function toggleRole(role: RoleCode, checked: boolean) {
    onChange({
      roles: checked ? [...draft.roles, role] : draft.roles.filter((entry) => entry !== role),
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-nid-border bg-secondary/40 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={ids.name} label="Nama" error={errors.name}>
          <Input
            id={ids.name}
            value={draft.name}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </Field>

        <Field id={ids.email} label="Email" error={errors.email}>
          <Input
            id={ids.email}
            type="email"
            value={draft.email}
            onChange={(event) => onChange({ email: event.target.value })}
          />
        </Field>

        <Field id={ids.jobTitle} label="Jabatan (tercetak di blok tanda tangan)" error={errors.jobTitle}>
          <Input
            id={ids.jobTitle}
            value={draft.jobTitle}
            onChange={(event) => onChange({ jobTitle: event.target.value })}
          />
        </Field>

        <Field id={ids.employeeNo} label="NIK (opsional)" error={errors.employeeNo}>
          <Input
            id={ids.employeeNo}
            value={draft.employeeNo}
            onChange={(event) => onChange({ employeeNo: event.target.value })}
          />
        </Field>

        <Field id={ids.department} label="Departemen" error={errors.departmentId}>
          <SelectNative
            id={ids.department}
            value={draft.departmentId}
            onChange={(event) => onChange({ departmentId: event.target.value })}
          >
            <option value="">— Tanpa departemen —</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.code} — {department.name}
                {department.isActive ? "" : " (nonaktif)"}
              </option>
            ))}
          </SelectNative>
        </Field>

        {withPassword ? (
          <Field
            id={ids.password}
            label={`Kata sandi awal (minimal ${PASSWORD_MIN} karakter)`}
            error={errors.password}
          >
            <Input
              id={ids.password}
              type="password"
              autoComplete="new-password"
              value={draft.password}
              onChange={(event) => onChange({ password: event.target.value })}
            />
          </Field>
        ) : null}
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium">Role</legend>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
          {ROLE_CODES.map((role) => (
            <label key={role} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.roles.includes(role)}
                onChange={(event) => toggleRole(role, event.target.checked)}
                className="size-4 rounded border-input accent-nid-orange-700"
              />
              {ROLE_LABEL[role]}
            </label>
          ))}
        </div>
        <FieldError messages={errors.roles} />
      </fieldset>

      <label htmlFor={ids.active} className="flex items-center gap-2 text-sm">
        <input
          id={ids.active}
          type="checkbox"
          checked={draft.isActive}
          onChange={(event) => onChange({ isActive: event.target.checked })}
          className="size-4 rounded border-input accent-nid-orange-700"
        />
        Aktif — dapat masuk portal dan menerima notifikasi
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

function PasswordReset({
  value,
  errors,
  saving,
  onChange,
  onSubmit,
  onCancel,
}: {
  value: string;
  errors: Record<string, string[]>;
  saving: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const id = useId();

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-nid-border bg-secondary/40 p-3">
      <div className="min-w-0 flex-1 space-y-1 sm:max-w-sm">
        <Label htmlFor={id} className="text-xs">
          Kata sandi baru (minimal {PASSWORD_MIN} karakter)
        </Label>
        <Input
          id={id}
          type="password"
          autoComplete="new-password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <FieldError messages={errors.password} />
        <p className="text-[11px] text-muted-foreground">
          Sampaikan sendiri kepada yang bersangkutan; portal tidak mengirimkannya lewat email.
        </p>
      </div>

      <Button type="button" size="sm" disabled={saving} onClick={onSubmit}>
        {saving ? <Loader2 aria-hidden className="animate-spin" /> : <KeyRound aria-hidden />}
        Ganti
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={onCancel}>
        Batal
      </Button>
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
