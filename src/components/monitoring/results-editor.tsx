"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MonitoringResultKind } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/format";
import {
  RESULT_DATE_LABEL,
  RESULT_KIND_LABEL,
  RESULT_QUANTITY_LABEL,
  resultBalance,
  totalResults,
} from "@/lib/monitoring";
import { addMonitoringResult, deleteMonitoringResult } from "@/server/actions/monitoring";

export interface ResultRowView {
  readonly id: string;
  readonly kind: MonitoringResultKind;
  readonly recordedOn: Date;
  readonly quantity: number;
  readonly okCount: number;
  readonly ngCount: number;
  readonly note: string | null;
  readonly recordedByName: string;
}

const EMPTY_FORM = { recordedOn: "", quantity: "", okCount: "", ngCount: "", note: "" };

/**
 * Tabel angka hasil produksi atau inspeksi di dalam satu periode.
 *
 * Barisnya bertambah sesuai frekuensi pencatatan di pabrik — harian, per shift, atau per
 * lot — dan portal tidak memaksakan salah satunya. Yang dijaga hanya bentuk angkanya:
 * OK + NG tidak pernah boleh melebihi jumlahnya, dan itu diperiksa ulang di server.
 *
 * Komponen yang sama dipakai kedua tabel; yang berbeda hanya label tanggal dan kolom
 * jumlahnya, karena "jumlah produksi" dan "jumlah diperiksa" bukan angka yang sama.
 */
export function ResultsEditor({
  periodId,
  kind,
  rows,
  canEdit,
}: {
  periodId: string;
  kind: MonitoringResultKind;
  rows: readonly ResultRowView[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const fieldId = useId();
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [isDeleting, startDelete] = useTransition();

  const totals = totalResults(rows);
  const quantityLabel = RESULT_QUANTITY_LABEL[kind];

  // Petunjuk langsung saat diketik. Tanpa ini, selisihnya baru ketahuan setelah tombol
  // ditekan — padahal ketiganya disalin dari lembar lain dan selisih itu justru yang
  // paling sering terjadi.
  const typed = {
    quantity: Number(form.quantity),
    okCount: Number(form.okCount),
    ngCount: Number(form.ngCount),
  };
  const filled =
    form.quantity !== "" &&
    form.okCount !== "" &&
    form.ngCount !== "" &&
    Object.values(typed).every((value) => Number.isFinite(value));
  const balance = filled
    ? resultBalance(typed.quantity, typed.okCount, typed.ngCount)
    : null;

  // Menyunting membersihkan galat dari percobaan sebelumnya. Galat merah yang tetap
  // menyala sementara angkanya sedang diperbaiki menyatakan sesuatu yang sudah tidak
  // benar lagi, dan petunjuk langsung di bawahnya sudah mengambil alih tugasnya.
  const set = (field: keyof typeof EMPTY_FORM, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors({});
  };

  async function add() {
    setErrors({});
    setSaving(true);

    try {
      const result = await addMonitoringResult(periodId, { kind, ...form });

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error("Baris gagal disimpan", { description: result.message });
        return;
      }

      toast.success("Baris tersimpan", { description: result.message });
      setForm(EMPTY_FORM);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-2.5" data-results={kind}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h5 className="text-sm font-medium">{RESULT_KIND_LABEL[kind]}</h5>
        {totals.rows > 0 ? (
          <p className="text-xs tabular text-muted-foreground">
            {totals.rows} baris · {totals.quantity.toLocaleString("id-ID")} pcs · NG{" "}
            {totals.ngCount.toLocaleString("id-ID")}
          </p>
        ) : null}
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[20rem] border-collapse text-xs">
            <thead>
              <tr className="border-b border-nid-border text-left text-muted-foreground">
                <th className="py-1.5 pr-2 font-medium">Tanggal</th>
                <th className="py-1.5 pr-2 text-right font-medium">{quantityLabel}</th>
                <th className="py-1.5 pr-2 text-right font-medium">OK</th>
                <th className="py-1.5 pr-2 text-right font-medium">NG</th>
                {canEdit ? <th className="w-8 py-1.5" /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                // Baris lama dari sebelum aturan ini ada bisa saja tidak seimbang.
                // Dibiarkan tanpa tanda, angkanya ikut terhitung di rekap dan grafik
                // seolah-olah benar; yang ditawarkan di sini justru sebaliknya —
                // ditunjukkan, lalu dihapus dan dicatat ulang.
                const rowBalance = resultBalance(row.quantity, row.okCount, row.ngCount);

                return (
                <tr key={row.id} className="border-b border-nid-border last:border-0 align-top">
                  <td className="py-1.5 pr-2">
                    <span className="tabular">{formatDate(row.recordedOn)}</span>
                    {rowBalance.balanced ? null : (
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--status-danger)]">
                        <TriangleAlert aria-hidden className="size-3 shrink-0" />
                        OK + NG {rowBalance.gap > 0 ? "kurang" : "lebih"}{" "}
                        {Math.abs(rowBalance.gap).toLocaleString("id-ID")}
                      </span>
                    )}
                    {row.note ? (
                      <span className="block text-[11px] break-words text-muted-foreground">
                        {row.note}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular">
                    {row.quantity.toLocaleString("id-ID")}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular">
                    {row.okCount.toLocaleString("id-ID")}
                  </td>
                  <td
                    className={`py-1.5 pr-2 text-right tabular ${
                      row.ngCount > 0 ? "font-medium text-[var(--status-danger)]" : ""
                    }`}
                  >
                    {row.ngCount.toLocaleString("id-ID")}
                  </td>
                  {canEdit ? (
                    <td className="py-1">
                      <button
                        type="button"
                        aria-label={`Hapus baris ${formatDate(row.recordedOn)}`}
                        disabled={isDeleting}
                        onClick={() =>
                          startDelete(async () => {
                            const result = await deleteMonitoringResult(row.id);
                            if (result.ok) router.refresh();
                            else
                              toast.error("Hapus baris gagal", { description: result.message });
                          })
                        }
                        className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary"
                      >
                        <Trash2 aria-hidden className="size-3.5" />
                      </button>
                    </td>
                  ) : null}
                </tr>
                );
              })}
            </tbody>
            {totals.rows > 1 ? (
              <tfoot>
                <tr className="border-t border-nid-border font-medium">
                  <td className="py-1.5 pr-2">Total</td>
                  <td className="py-1.5 pr-2 text-right tabular">
                    {totals.quantity.toLocaleString("id-ID")}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular">
                    {totals.okCount.toLocaleString("id-ID")}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular">
                    {totals.ngCount.toLocaleString("id-ID")}
                  </td>
                  {canEdit ? <td /> : null}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Belum ada angka yang dicatat.</p>
      )}

      {canEdit ? (
        <div className="space-y-2 rounded-lg border border-dashed border-nid-border px-3 py-2.5">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field
              id={`${fieldId}-date`}
              label={RESULT_DATE_LABEL[kind]}
              type="date"
              value={form.recordedOn}
              onChange={(value) => set("recordedOn", value)}
              messages={errors.recordedOn}
            />
            <Field
              id={`${fieldId}-qty`}
              label={quantityLabel}
              type="number"
              value={form.quantity}
              onChange={(value) => set("quantity", value)}
              messages={errors.quantity}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field
              id={`${fieldId}-ok`}
              label="Total OK"
              type="number"
              value={form.okCount}
              onChange={(value) => set("okCount", value)}
              messages={errors.okCount}
            />
            <Field
              id={`${fieldId}-ng`}
              label="Total NG"
              type="number"
              value={form.ngCount}
              onChange={(value) => set("ngCount", value)}
              messages={errors.ngCount}
            />
          </div>

          {/* Petunjuk langsung mundur selama pesan dari server masih terpampang: keduanya
              menyatakan hal yang sama, dan dua kalimat merah berturut-turut terbaca
              seperti dua masalah yang berbeda. */}
          {balance && !errors.okCount?.length ? (
            <p
              className={`text-[11px] ${
                balance.balanced
                  ? "text-[var(--status-closed)]"
                  : "text-[var(--status-danger)]"
              }`}
            >
              {balance.balanced
                ? `OK + NG = ${balance.judged.toLocaleString("id-ID")}, cocok dengan jumlahnya.`
                : `OK + NG = ${balance.judged.toLocaleString("id-ID")} · ${
                    balance.gap > 0 ? "kurang" : "lebih"
                  } ${Math.abs(balance.gap).toLocaleString("id-ID")} dari ${typed.quantity.toLocaleString("id-ID")}.`}
            </p>
          ) : null}

          <Field
            id={`${fieldId}-note`}
            label="Keterangan (opsional)"
            type="text"
            value={form.note}
            onChange={(value) => set("note", value)}
            messages={errors.note}
          />

          <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={() => void add()}>
            {saving ? <Loader2 aria-hidden className="animate-spin" /> : <Plus aria-hidden />}
            Tambah baris
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  messages,
}: {
  id: string;
  label: string;
  type: "date" | "number" | "text";
  value: string;
  onChange: (value: string) => void;
  messages?: readonly string[];
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[11px] text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        inputMode={type === "number" ? "numeric" : undefined}
        min={type === "number" ? 0 : undefined}
        value={value}
        aria-invalid={Boolean(messages?.length)}
        onChange={(event) => onChange(event.target.value)}
      />
      {messages?.length ? (
        <p role="alert" className="text-[11px] text-destructive">
          {messages[0]}
        </p>
      ) : null}
    </div>
  );
}
