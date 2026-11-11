"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, PlayCircle, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CHECK_ITEM_COUNT_MAX } from "@/lib/monitoring";
import { startMonitoring } from "@/server/actions/monitoring";

/**
 * Action Button C — membuka jadwal pemantauan (§6 Modul 4).
 *
 * Jumlah periode dan jaraknya ditentukan di sini, sekali, lalu seluruh tenggat dihitung
 * server dengan hari kerja. Tanggal tidak diketik satu per satu: menghitung sendiri enam
 * tanggal yang melompati akhir pekan adalah pekerjaan yang mudah salah dan tidak ada
 * gunanya diserahkan ke manusia.
 */
export function StartMonitoring({ claimId }: { claimId: string }) {
  const router = useRouter();
  const [periodCount, setPeriodCount] = useState("3");
  const [intervalDays, setIntervalDays] = useState("5");
  const [checkItems, setCheckItems] = useState<string[]>([""]);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);

  async function submit() {
    setErrors({});
    setPending(true);

    try {
      const result = await startMonitoring(claimId, {
        periodCount,
        intervalDays,
        checkItems,
        note,
      });

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error("Pemantauan gagal dibuka", { description: result.message });
        return;
      }

      toast.success("Pemantauan dibuka", { description: result.message });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="period-count">Jumlah periode</Label>
          <Input
            id="period-count"
            type="number"
            inputMode="numeric"
            min={1}
            max={12}
            value={periodCount}
            onChange={(event) => setPeriodCount(event.target.value)}
          />
          <FieldError messages={errors.periodCount} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="interval-days">Jarak antar periode (hari kerja)</Label>
          <Input
            id="interval-days"
            type="number"
            inputMode="numeric"
            min={1}
            max={90}
            value={intervalDays}
            onChange={(event) => setIntervalDays(event.target.value)}
          />
          <FieldError messages={errors.intervalDays} />
        </div>
      </div>

      <CheckItemsField items={checkItems} onChange={setCheckItems} errors={errors} />

      <div className="space-y-1.5">
        <Label htmlFor="monitoring-note">Catatan pembuka (opsional)</Label>
        <Textarea
          id="monitoring-note"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Mis. ukur pada 500 pcs pertama tiap periode, sertakan foto hasil inspeksi."
        />
        <FieldError messages={errors.note} />
      </div>

      <FieldError messages={errors._form} />

      <Button type="button" size="lg" onClick={() => void submit()} disabled={pending}>
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : <PlayCircle aria-hidden />}
        Start CAPA monitoring
      </Button>
    </div>
  );
}

/**
 * Item aktivitas yang dipantau.
 *
 * Ditulis di muka, sebelum ada hasilnya, karena inilah yang nanti dilampirkan sebagai
 * bukti efektivitas pada tiap periode. Daftar yang disusun belakangan selalu berisi apa
 * yang kebetulan sempat dikumpulkan, bukan apa yang memang hendak diukur.
 *
 * Pesan galat dari server datang per indeks (`checkItems.0`); yang ditampilkan di sini
 * digabung ke barisnya masing-masing supaya orang tahu baris mana yang ditolak, bukan
 * sekadar bahwa daftarnya bermasalah.
 */
function CheckItemsField({
  items,
  onChange,
  errors,
}: {
  items: readonly string[];
  onChange: (items: string[]) => void;
  errors: Record<string, string[]>;
}) {
  const update = (index: number, value: string) =>
    onChange(items.map((item, position) => (position === index ? value : item)));

  const listError = errors.checkItems?.[0];

  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <Label htmlFor="check-item-0">Item yang dipantau</Label>
        <p className="text-xs text-muted-foreground">
          Apa yang akan diperiksa tiap periode. Item inilah yang dilampirkan buktinya, dan
          periode tidak dapat dinyatakan Effective selama masih ada item tanpa bukti.
        </p>
      </div>

      <ul className="space-y-2">
        {items.map((item, index) => (
          // Indeks sebagai key: barisnya tidak punya penanda lain sampai tersimpan, dan
          // daftar ini hanya bertambah atau berkurang di ujung saat form masih terbuka.
          <li key={index} className="space-y-1">
            <div className="flex items-start gap-2">
              <span className="mt-2.5 w-4 shrink-0 text-xs tabular text-muted-foreground">
                {index + 1}
              </span>

              <Input
                id={`check-item-${index}`}
                value={item}
                maxLength={200}
                placeholder={
                  index === 0
                    ? "Mis. hasil inspeksi 100% kaki pengunci pada 500 pcs pertama"
                    : "Item berikutnya"
                }
                onChange={(event) => update(index, event.target.value)}
              />

              {items.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Hapus item ${index + 1}`}
                  onClick={() => onChange(items.filter((_, position) => position !== index))}
                  className="mt-1 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              ) : null}
            </div>

            <FieldError messages={errors[`checkItems.${index}`]} />
          </li>
        ))}
      </ul>

      {items.length < CHECK_ITEM_COUNT_MAX ? (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, ""])}>
          <Plus aria-hidden />
          Tambah item
        </Button>
      ) : null}

      {listError ? <FieldError messages={[listError]} /> : null}
    </div>
  );
}

function FieldError({ messages }: { messages?: readonly string[] }) {
  if (!messages?.length) return null;

  return (
    <p role="alert" className="text-sm text-destructive">
      {messages[0]}
    </p>
  );
}
