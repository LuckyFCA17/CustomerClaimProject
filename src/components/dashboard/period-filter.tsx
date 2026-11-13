"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, RotateCcw } from "lucide-react";

import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select-native";
import { MONTH_NAMES } from "@/lib/dashboard";

/**
 * Pemilih periode grafik — dipakai Dashboard maupun Claim Analytics.
 *
 * Periodenya hidup di URL (`?from=2026-01&to=2026-06`), bukan di state komponen. Tiga
 * alasannya: halaman dashboard adalah server component yang menghitung angkanya di
 * basis data, jadi periode harus sampai ke server; tautannya dapat dikirim ke orang
 * lain dan menampilkan periode yang sama; dan tombol kembali peramban mengembalikan
 * periode sebelumnya tanpa kode tambahan.
 *
 * Tujuannya diambil dari `usePathname`, bukan dituliskan sebagai `/dashboard`: komponen
 * ini dipakai di lebih dari satu halaman, dan jalur yang tertulis mati pernah melempar
 * orang dari Claim Analytics ke Dashboard begitu mereka mengganti bulan. Membacanya dari
 * alamat yang sedang dibuka berarti halaman berikutnya yang memakai pemilih ini tidak
 * perlu mengingat apa pun.
 *
 * Tidak ada tombol "Terapkan". Di layar sentuh setiap ketukan tambahan terasa, dan
 * pilihan yang sudah dipilih tetapi belum diterapkan adalah keadaan yang membingungkan —
 * grafik di bawahnya memperlihatkan periode lain daripada yang tertera di pemilihnya.
 */
export function PeriodFilter({
  from,
  to,
  years,
  isDefault,
}: {
  /** `2026-01` */
  readonly from: string;
  readonly to: string;
  readonly years: readonly number[];
  readonly isDefault: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const split = (value: string) => {
    const [year, month] = value.split("-");
    return { year: Number(year), month: Number(month) - 1 };
  };

  const start = split(from);
  const end = split(to);

  function apply(nextFrom: string, nextTo: string) {
    const params = new URLSearchParams({ from: nextFrom, to: nextTo });

    startTransition(() => {
      // `replace`, bukan `push`: mengubah bulan berkali-kali tidak boleh menumpuk
      // belasan langkah di riwayat yang harus ditekan kembali satu per satu.
      router.replace(`${pathname}?${params.toString()}`);
    });
  }

  const key = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, "0")}`;

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <Field label="Dari">
        <SelectNative
          aria-label="Bulan awal"
          className="w-32"
          value={String(start.month)}
          onChange={(event) => apply(key(start.year, Number(event.target.value)), to)}
        >
          {MONTH_NAMES.map((name, index) => (
            <option key={name} value={index}>
              {name}
            </option>
          ))}
        </SelectNative>

        <SelectNative
          aria-label="Tahun awal"
          className="w-24"
          value={String(start.year)}
          onChange={(event) => apply(key(Number(event.target.value), start.month), to)}
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </SelectNative>
      </Field>

      <Field label="Sampai">
        <SelectNative
          aria-label="Bulan akhir"
          className="w-32"
          value={String(end.month)}
          onChange={(event) => apply(from, key(end.year, Number(event.target.value)))}
        >
          {MONTH_NAMES.map((name, index) => (
            <option key={name} value={index}>
              {name}
            </option>
          ))}
        </SelectNative>

        <SelectNative
          aria-label="Tahun akhir"
          className="w-24"
          value={String(end.year)}
          onChange={(event) => apply(from, key(Number(event.target.value), end.month))}
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </SelectNative>
      </Field>

      <div className="flex h-9 items-center gap-2 text-xs text-muted-foreground">
        {isPending ? (
          <>
            <Loader2 aria-hidden className="size-3.5 animate-spin" />
            <span>Menghitung ulang…</span>
          </>
        ) : isDefault ? (
          <span>Bawaan: dua belas bulan terakhir.</span>
        ) : (
          <button
            type="button"
            onClick={() => startTransition(() => router.replace(pathname))}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-nid-orange-700 hover:bg-secondary"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Kembali ke 12 bulan terakhir
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}
