"use client";

import { useId, useRef } from "react";
import Link from "next/link";
import { RotateCcw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select-native";
import { CLAIM_STATUS_META, CLAIM_STATUSES } from "@/config/claim-status";
import {
  CLAIM_SORTS,
  PAGE_SIZES,
  SEARCH_MAX,
  SORT_KEYS,
  type ClaimQuery,
  hasActiveFilter,
} from "@/lib/claim-filters";

export interface CustomerOption {
  readonly id: string;
  readonly name: string;
}

const TYPE_LABEL: Record<string, string> = {
  OFFICIAL: "Official",
  NON_OFFICIAL: "Non-Official",
  INFORMATION_ONLY: "Information Only",
};

/**
 * Penyaring daftar klaim.
 *
 * Sebuah `<form method="get">` biasa, bukan state di komponen: hasilnya tertulis di
 * alamat halaman, sehingga tampilan yang sudah disaring dapat ditandai, dibagikan, dan
 * dibuka lagi dari tombol kembali. Dropdown mengirim sendiri begitu diubah — menyaring
 * lalu masih harus menekan "Terapkan" membuat orang mengira filternya rusak — sedangkan
 * kotak pencarian menunggu Enter, karena mengirim tiap ketukan huruf akan memuat ulang
 * daftar belasan kali untuk satu kata.
 *
 * Nomor halaman sengaja tidak ikut dikirim: penyaring yang berubah selalu memulai dari
 * halaman pertama, dan membawa "halaman 5" ke hasil yang baru hampir selalu salah.
 */
export function ClaimFilters({
  query,
  customers,
}: {
  query: ClaimQuery;
  customers: readonly CustomerOption[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const ids = {
    q: useId(),
    status: useId(),
    type: useId(),
    customer: useId(),
    from: useId(),
    to: useId(),
    sort: useId(),
    per: useId(),
  };

  const submit = () => formRef.current?.requestSubmit();

  /**
   * Kolom kosong tidak ikut dikirim.
   *
   * Form GET biasa menuliskan seluruh kolomnya, termasuk yang kosong, sehingga alamatnya
   * menjadi `?q=&status=PUBLISHED&type=&customer=&from=&to=` — sulit dibaca, dan dua
   * tautan ke tampilan yang sama bisa berbeda tulisannya. Menonaktifkan kolom kosong
   * tepat sebelum kirim membuat peramban melewatkannya, tanpa meninggalkan form biasa.
   */
  function pruneEmpty(event: React.FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;

    for (const field of form.elements) {
      if (
        (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) &&
        field.name &&
        field.value === ""
      ) {
        field.disabled = true;
        // Dinyalakan kembali setelah kiriman berangkat, supaya kolomnya tetap dapat
        // dipakai bila navigasinya batal atau pengguna menekan tombol kembali.
        setTimeout(() => {
          field.disabled = false;
        }, 0);
      }
    }
  }

  return (
    <form ref={formRef} method="get" onSubmit={pruneEmpty} className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1 sm:min-w-[18rem]">
          <Label htmlFor={ids.q} className="text-xs">
            Pencarian
          </Label>
          <div className="relative">
            <Search
              aria-hidden
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={ids.q}
              name="q"
              type="search"
              maxLength={SEARCH_MAX}
              defaultValue={query.q}
              placeholder="Claim no., CPAR no., part, lot, customer, atau isi problem"
              className="pl-9"
            />
          </div>
        </div>

        <Button type="submit">
          <Search aria-hidden />
          Cari
        </Button>

        {hasActiveFilter(query) ? (
          <Button type="button" variant="ghost" asChild>
            <Link href="/claims">
              <RotateCcw aria-hidden />
              Reset
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field id={ids.status} label="Status">
          <SelectNative id={ids.status} name="status" defaultValue={query.status ?? ""} onChange={submit}>
            <option value="">Semua status</option>
            {CLAIM_STATUSES.map((status) => (
              <option key={status} value={status}>
                {CLAIM_STATUS_META[status].label}
              </option>
            ))}
          </SelectNative>
        </Field>

        <Field id={ids.type} label="Jenis klaim">
          <SelectNative id={ids.type} name="type" defaultValue={query.type ?? ""} onChange={submit}>
            <option value="">Semua jenis</option>
            {Object.entries(TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectNative>
        </Field>

        <Field id={ids.customer} label="Customer">
          <SelectNative
            id={ids.customer}
            name="customer"
            defaultValue={query.customerId ?? ""}
            onChange={submit}
          >
            <option value="">Semua customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </SelectNative>
        </Field>

        <Field id={ids.sort} label="Urutkan">
          <SelectNative id={ids.sort} name="sort" defaultValue={query.sort} onChange={submit}>
            {SORT_KEYS.map((key) => (
              <option key={key} value={key}>
                {CLAIM_SORTS[key].label}
              </option>
            ))}
          </SelectNative>
        </Field>

        <Field id={ids.from} label="Tanggal kejadian dari">
          <Input
            id={ids.from}
            name="from"
            type="date"
            defaultValue={query.from ?? ""}
            onChange={submit}
          />
        </Field>

        <Field id={ids.to} label="sampai">
          <Input id={ids.to} name="to" type="date" defaultValue={query.to ?? ""} onChange={submit} />
        </Field>

        <Field id={ids.per} label="Tampilkan per halaman">
          <SelectNative
            id={ids.per}
            name="per"
            defaultValue={String(query.perPage)}
            onChange={submit}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} item
              </option>
            ))}
          </SelectNative>
        </Field>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {children}
    </div>
  );
}
