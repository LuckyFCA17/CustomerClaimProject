"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CircleAlert, CircleCheck, Loader2, Plus, Trash2, TriangleAlert } from "lucide-react";

import { Fishbone } from "@/components/cpar/fishbone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select-native";
import { Textarea } from "@/components/ui/textarea";
import type { CparSectionKey } from "@/generated/prisma/enums";
import {
  CATEGORY_HINT,
  CATEGORY_LABEL,
  FISHBONE_CATEGORIES,
  JUDGEMENTS,
  JUDGEMENT_LABEL,
  WHY_DEPTH,
  type FishboneCategory,
  type Judgement,
  type RootCauseFactor,
  type RootCauseInput,
  blankFactor,
  countNg,
  factorsWithWhys,
  filledWhys,
} from "@/schemas/root-cause";
import { saveCparRootCause } from "@/server/actions/cpar-filling";

interface DraftFactor extends RootCauseFactor {
  readonly id: string;
}

let factorCounter = 0;

function toDraft(factor: RootCauseFactor): DraftFactor {
  factorCounter += 1;

  return { ...factor, id: `factor-${factorCounter}` };
}

/**
 * Analisis akar masalah: diagram tulang ikan di atas, tabel 4M1E di bawahnya.
 *
 * Keduanya dibangun dari satu daftar faktor. Yang diisi orang adalah tabelnya — di
 * sanalah control point dan kondisi aktual punya tempat — sedangkan diagramnya menyusun
 * ulang baris yang sama menurut kategorinya, sehingga sebaran penyebab terlihat sekali
 * pandang tanpa pernah bisa berbeda dari tabelnya.
 */
export function RootCauseEditor({
  claimId,
  sectionKey,
  value,
  canFill,
  locked,
  defaultProblem,
  legacyText,
}: {
  claimId: string;
  sectionKey: Extract<CparSectionKey, "ROOT_CAUSE_OCCURRENCE" | "ROOT_CAUSE_OUTFLOW">;
  value: RootCauseInput;
  canFill: boolean;
  locked: boolean;
  /** Usulan isi kepala ikan bila belum ditulis — diambil dari masalah klaimnya. */
  defaultProblem: string;
  legacyText?: string | null;
}) {
  const router = useRouter();
  const [factors, setFactors] = useState<DraftFactor[]>(() => value.factors.map(toDraft));
  const [problem, setProblem] = useState(value.problem ?? "");
  const [conclusion, setConclusion] = useState(value.conclusion ?? "");
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  function update(id: string, patch: Partial<RootCauseFactor>) {
    setFactors((current) =>
      current.map((factor) => (factor.id === id ? { ...factor, ...patch } : factor)),
    );
  }

  async function save() {
    setErrors({});
    setSaving(true);

    try {
      const result = await saveCparRootCause(claimId, {
        sectionKey,
        problem: problem || defaultProblem,
        conclusion,
        factors: factors.map((factor) => ({
          category: factor.category,
          item: factor.item,
          controlPoint: factor.controlPoint,
          actual: factor.actual,
          judgement: factor.judgement,
          note: factor.note,
          // Ekor kosong tidak ikut dikirim: rantai yang berhenti di tingkat ketiga
          // disimpan sepanjang tiga, bukan tiga jawaban dan dua baris kosong.
          whys: filledWhys(factor),
        })),
      });

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error("Gagal menyimpan", { description: result.message });
        return;
      }

      toast.success("Analisis tersimpan", { description: result.message });
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <RootCauseView
        value={value}
        canEdit={canFill && !locked}
        legacyText={legacyText}
        onEdit={() => setEditing(true)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${sectionKey}-problem`}>Akibat yang dianalisis (kepala ikan)</Label>
        <Input
          id={`${sectionKey}-problem`}
          value={problem}
          placeholder={defaultProblem}
          onChange={(event) => setProblem(event.target.value)}
        />
      </div>

      {factors.length === 0 ? (
        <p className="rounded-lg border border-dashed border-nid-border px-3 py-6 text-center text-sm text-muted-foreground">
          Belum ada faktor. Tambahkan dari salah satu kategori 4M1E di bawah.
        </p>
      ) : (
        <ol className="space-y-3">
          {factors.map((factor, index) => (
            <li key={factor.id}>
              <FactorRow
                factor={factor}
                index={index}
                errors={errors}
                onChange={(patch) => update(factor.id, patch)}
                onRemove={() => setFactors((c) => c.filter((f) => f.id !== factor.id))}
              />
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap gap-2">
        {FISHBONE_CATEGORIES.map((category) => (
          <Button
            key={category}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setFactors((current) => [...current, toDraft(blankFactor(category))])}
          >
            <Plus aria-hidden />
            {CATEGORY_LABEL[category]}
          </Button>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${sectionKey}-conclusion`}>Kesimpulan akar masalah</Label>
        <Textarea
          id={`${sectionKey}-conclusion`}
          rows={3}
          value={conclusion}
          onChange={(event) => setConclusion(event.target.value)}
          placeholder="Faktor mana yang terbukti menjadi penyebab, dan mengapa."
        />
        <FieldError messages={errors.conclusion} />
      </div>

      <FieldError messages={errors._form ?? errors.factors} />

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
            setFactors(value.factors.map(toDraft));
            setProblem(value.problem ?? "");
            setConclusion(value.conclusion ?? "");
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

function FactorRow({
  factor,
  index,
  errors,
  onChange,
  onRemove,
}: {
  factor: DraftFactor;
  index: number;
  errors: Record<string, string[]>;
  onChange: (patch: Partial<RootCauseFactor>) => void;
  onRemove: () => void;
}) {
  const ids = {
    category: useId(),
    item: useId(),
    control: useId(),
    actual: useId(),
    judgement: useId(),
  };
  const errorFor = (field: string) => errors[`factors.${index}.${field}`];

  // Rantai 5 Why terbuka sendiri pada faktor yang dinilai NG — di situlah penelusurannya
  // bermakna. Faktor yang sudah terlanjur punya rantai tetap menampilkannya meski
  // judgement-nya berubah, supaya isian yang pernah ditulis tidak hilang dari layar.
  const [opened, setOpened] = useState(false);
  const showWhy =
    opened || factor.judgement === "NG" || (factor.whys ?? []).some((why) => why.trim());

  return (
    <div className="rounded-lg border border-nid-border p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={ids.category} className="text-xs">
              Kategori 4M1E
            </Label>
            <SelectNative
              id={ids.category}
              value={factor.category}
              onChange={(event) => onChange({ category: event.target.value as FishboneCategory })}
            >
              {FISHBONE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABEL[category]}
                </option>
              ))}
            </SelectNative>
            <p className="text-[11px] text-muted-foreground">{CATEGORY_HINT[factor.category]}</p>
          </div>

          <div className="space-y-1">
            <Label htmlFor={ids.item} className="text-xs">
              Item yang diperiksa
            </Label>
            <Input
              id={ids.item}
              value={factor.item}
              placeholder="Mis. setting tekanan holding"
              onChange={(event) => onChange({ item: event.target.value })}
            />
            <FieldError messages={errorFor("item")} />
          </div>

          <div className="space-y-1">
            <Label htmlFor={ids.control} className="text-xs">
              Control point (standar acuan)
            </Label>
            <Input
              id={ids.control}
              value={factor.controlPoint ?? ""}
              placeholder="Mis. WI-PRD-014: 48–52 MPa"
              onChange={(event) => onChange({ controlPoint: event.target.value })}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor={ids.actual} className="text-xs">
              Kondisi aktual
            </Label>
            <Input
              id={ids.actual}
              value={factor.actual ?? ""}
              placeholder="Mis. terukur 42 MPa pada mesin 4"
              onChange={(event) => onChange({ actual: event.target.value })}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor={ids.judgement} className="text-xs">
              Judgement
            </Label>
            <SelectNative
              id={ids.judgement}
              value={factor.judgement}
              onChange={(event) => onChange({ judgement: event.target.value as Judgement })}
            >
              {JUDGEMENTS.map((judgement) => (
                <option key={judgement} value={judgement}>
                  {JUDGEMENT_LABEL[judgement]}
                </option>
              ))}
            </SelectNative>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Keterangan (opsional)</Label>
            <Input
              value={factor.note ?? ""}
              placeholder="Bukti atau catatan pemeriksaan"
              onChange={(event) => onChange({ note: event.target.value })}
            />
          </div>

          <div className="sm:col-span-2">
            {showWhy ? (
              <WhyChainEditor
                whys={factor.whys ?? []}
                errors={errors}
                index={index}
                onChange={(whys) => onChange({ whys })}
              />
            ) : (
              // Faktor yang dinilai OK pun kadang perlu ditelusuri — mis. "OK but need
              // improvement" yang standarnya sendiri yang bermasalah.
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpened(true)}>
                <Plus aria-hidden />
                Telusuri 5 Why
              </Button>
            )}
          </div>
        </div>

        <button
          type="button"
          aria-label={`Hapus faktor ${index + 1}`}
          onClick={onRemove}
          className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary"
        >
          <Trash2 aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Rantai "mengapa" sedalam lima tingkat.
 *
 * Tingkat berikutnya baru muncul setelah tingkat sebelumnya terisi: menampilkan lima
 * kotak kosong sekaligus mengesankan kelimanya wajib, padahal rantai yang jujur sering
 * berhenti lebih awal — begitu sampai pada sebab yang dapat dikendalikan.
 */
function WhyChainEditor({
  whys,
  index,
  errors,
  onChange,
}: {
  whys: readonly string[];
  index: number;
  errors: Record<string, string[]>;
  onChange: (whys: string[]) => void;
}) {
  // Akar adalah jawaban terdalam yang terisi, bukan yang ke-sekian dari jumlah isian:
  // ketika satu tingkat di tengah dikosongkan, hitungan jumlah akan menunjuk baris yang
  // salah sebagai akar.
  const deepest = whys.map((why) => why.trim().length > 0).lastIndexOf(true);
  const shown = Math.min(WHY_DEPTH, Math.max(1, deepest + 2));

  function set(level: number, value: string) {
    const next = Array.from({ length: WHY_DEPTH }, (_, i) => whys[i] ?? "");
    next[level] = value;

    // Ekor kosong tidak perlu disimpan; rantai disimpan sepanjang isinya saja.
    const last = next.map((why) => why.trim().length > 0).lastIndexOf(true);
    onChange(last === -1 ? [] : next.slice(0, last + 1));
  }

  return (
    <fieldset className="rounded-lg border border-nid-border bg-secondary/40 p-2.5">
      <legend className="px-1 text-xs font-medium">5 Why</legend>

      <ol className="space-y-1.5">
        {Array.from({ length: shown }, (_, level) => {
          const isRoot = level === deepest;

          return (
            <li key={level} className="flex items-start gap-2">
              <span className="mt-2 w-12 shrink-0 text-[11px] text-muted-foreground">
                Why {level + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <Input
                  aria-label={`Why ${level + 1} untuk faktor ${index + 1}`}
                  value={whys[level] ?? ""}
                  placeholder={
                    level === 0 ? "Mengapa kondisi aktual itu terjadi?" : "Mengapa itu terjadi?"
                  }
                  onChange={(event) => set(level, event.target.value)}
                />
                <FieldError messages={errors[`factors.${index}.whys.${level}`]} />
              </div>
              {isRoot ? (
                <span className="mt-1.5 shrink-0 rounded-full bg-[var(--status-danger-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--status-danger)]">
                  akar
                </span>
              ) : (
                <span className="w-9 shrink-0" />
              )}
            </li>
          );
        })}
      </ol>

      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Berhenti begitu sampai pada sebab yang dapat dikendalikan — tidak harus lima tingkat.
      </p>
    </fieldset>
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

const JUDGEMENT_BADGE: Record<Judgement, { className: string; icon: typeof CircleCheck }> = {
  OK: {
    className: "bg-[var(--status-closed-bg)] text-[var(--status-closed)]",
    icon: CircleCheck,
  },
  NG: {
    className: "bg-[var(--status-danger-bg)] text-[var(--status-danger)]",
    icon: CircleAlert,
  },
  OK_NEED_IMPROVEMENT: {
    className: "bg-[var(--status-pending-bg)] text-[var(--status-pending)]",
    icon: TriangleAlert,
  },
};

/**
 * Rantai 5 Why pada tampilan baca.
 *
 * Diletakkan di bawah tabel, bukan di dalam selnya: rantai sepanjang lima baris di dalam
 * satu sel akan memaksa tabelnya melebar sampai kolom lain tak terbaca. Tiap rantai
 * menyebut faktor asalnya, sehingga tetap jelas "mengapa" atas apa yang sedang dirunut.
 */
function WhyChainList({ value }: { value: RootCauseInput }) {
  const factors = factorsWithWhys(value);
  if (factors.length === 0) return null;

  return (
    <section className="space-y-2">
      <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Analisis 5 Why</h4>

      <ul className="space-y-2">
        {factors.map((factor, index) => {
          const whys = filledWhys(factor);

          return (
            <li
              key={`${factor.item}-${index}`}
              className="rounded-lg border border-nid-border bg-secondary/40 p-3"
            >
              <div className="text-sm font-medium break-words">
                <span className="text-xs uppercase tracking-wide text-nid-orange-700">
                  {CATEGORY_LABEL[factor.category]}
                </span>{" "}
                {factor.item}
              </div>

              <ol className="mt-2 space-y-1">
                {whys.map((why, level) => {
                  const isRoot = level === whys.length - 1;

                  return (
                    <li key={level} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 w-12 shrink-0 text-xs text-muted-foreground">
                        Why {level + 1}
                      </span>
                      <span className={`min-w-0 break-words ${isRoot ? "font-medium" : ""}`}>
                        {why}
                      </span>
                      {isRoot ? (
                        <span className="mt-0.5 shrink-0 rounded-full bg-[var(--status-danger-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--status-danger)]">
                          akar
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Tampilan baca: diagram lebih dulu, lalu tabel 4M1E yang menjadi sumbernya. */
export function RootCauseView({
  value,
  canEdit,
  legacyText,
  onEdit,
}: {
  value: RootCauseInput;
  canEdit: boolean;
  legacyText?: string | null;
  onEdit?: () => void;
}) {
  if (value.factors.length === 0) {
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
            Mulai analisis 4M1E
          </Button>
        ) : null}
      </div>
    );
  }

  const ng = countNg(value);

  return (
    <div className="space-y-4">
      <Fishbone value={value} />

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-nid-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-1.5 pr-3 font-medium">4M1E</th>
              <th className="py-1.5 pr-3 font-medium">Item</th>
              <th className="py-1.5 pr-3 font-medium">Control point</th>
              <th className="py-1.5 pr-3 font-medium">Kondisi aktual</th>
              <th className="py-1.5 font-medium">Judgement</th>
            </tr>
          </thead>
          <tbody>
            {value.factors.map((factor, index) => {
              const badge = JUDGEMENT_BADGE[factor.judgement];
              const Icon = badge.icon;

              return (
                <tr key={`${factor.item}-${index}`} className="border-b border-nid-border last:border-0">
                  <td className="py-2 pr-3 align-top text-xs uppercase tracking-wide text-muted-foreground">
                    {CATEGORY_LABEL[factor.category]}
                  </td>
                  <td className="py-2 pr-3 align-top">
                    <div className="break-words">{factor.item}</div>
                    {factor.note ? (
                      <div className="text-xs text-muted-foreground">{factor.note}</div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 align-top break-words text-muted-foreground">
                    {factor.controlPoint || "—"}
                  </td>
                  <td className="py-2 pr-3 align-top break-words">{factor.actual || "—"}</td>
                  <td className="py-2 align-top">
                    <span
                      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}
                    >
                      <Icon aria-hidden className="size-3" />
                      {JUDGEMENT_LABEL[factor.judgement]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <WhyChainList value={value} />

      {ng === 0 ? (
        <p className="text-xs text-[var(--status-pending)]">
          Belum ada faktor yang dinilai NG — akar masalahnya belum tertunjuk pada sisi ini.
        </p>
      ) : null}

      {value.conclusion ? (
        <div>
          <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Kesimpulan</h4>
          <p className="mt-1 whitespace-pre-line break-words text-sm">{value.conclusion}</p>
        </div>
      ) : null}

      {canEdit && onEdit ? (
        <Button type="button" size="sm" variant="outline" onClick={onEdit}>
          Ubah
        </Button>
      ) : null}
    </div>
  );
}
