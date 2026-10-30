"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, PlayCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);

  async function submit() {
    setErrors({});
    setPending(true);

    try {
      const result = await startMonitoring(claimId, { periodCount, intervalDays, note });

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

function FieldError({ messages }: { messages?: readonly string[] }) {
  if (!messages?.length) return null;

  return (
    <p role="alert" className="text-sm text-destructive">
      {messages[0]}
    </p>
  );
}
