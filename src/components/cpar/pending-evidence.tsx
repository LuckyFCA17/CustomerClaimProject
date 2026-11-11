"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CircleCheck,
  CircleDashed,
  FileUp,
  Loader2,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { submitUpload } from "@/components/shared/submit-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select-native";
import { formatDate } from "@/lib/format";
import { PAGE_SIZES } from "@/lib/claim-filters";
import {
  COMPLETION_LABEL,
  EVIDENCE_PREFIX,
  EVIDENCE_SORTS,
  EVIDENCE_SORT_KEYS,
  type Completion,
  type EvidenceQuery,
  type EvidenceRequestRow,
  completionOf,
  hasActiveEvidenceFilter,
} from "@/lib/evidence-requests";
import { uploadActionItemEvidence, uploadInitialDocument } from "@/server/actions/cpar-filling";
import { ACCEPT_EVIDENCE } from "@/lib/uploads";

const COMPLETION_STYLE: Record<Completion, { className: string; icon: typeof CircleCheck }> = {
  DONE: {
    className: "bg-[var(--status-closed-bg)] text-[var(--status-closed)]",
    icon: CircleCheck,
  },
  OVERDUE: {
    className: "bg-[var(--status-danger-bg)] text-[var(--status-danger)]",
    icon: TriangleAlert,
  },
  PENDING: {
    className: "bg-[var(--status-pending-bg)] text-[var(--status-pending)]",
    icon: CircleDashed,
  },
};

/**
 * Penyaring tabel permintaan evidence.
 *
 * Parameternya berawalan supaya tidak bertabrakan dengan penyaring daftar CPAR di
 * halaman yang sama, dan penyaring tabel sebelah dititipkan sebagai kolom tersembunyi —
 * form GET hanya mengirim kolomnya sendiri.
 */
export function EvidenceFilters({
  query,
  action,
  hidden = {},
}: {
  query: EvidenceQuery;
  action: string;
  hidden?: Readonly<Record<string, string>>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const ids = { status: useId(), from: useId(), to: useId(), sort: useId(), per: useId() };
  const name = (key: string) => `${EVIDENCE_PREFIX}${key}`;

  const submit = () => formRef.current?.requestSubmit();

  function pruneEmpty(event: React.FormEvent<HTMLFormElement>) {
    for (const field of event.currentTarget.elements) {
      if (
        (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) &&
        field.name &&
        field.type !== "hidden" &&
        field.value === ""
      ) {
        field.disabled = true;
        setTimeout(() => {
          field.disabled = false;
        }, 0);
      }
    }
  }

  return (
    <form
      ref={formRef}
      action={action}
      method="get"
      onSubmit={pruneEmpty}
      className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
    >
      {Object.entries(hidden).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}

      <div className="space-y-1">
        <Label htmlFor={ids.status} className="text-xs">
          Status
        </Label>
        <SelectNative
          id={ids.status}
          name={name("status")}
          defaultValue={query.status ?? ""}
          onChange={submit}
        >
          <option value="">Semua status</option>
          <option value="OVERDUE">Lewat tenggat</option>
          <option value="PENDING">Menunggu</option>
          <option value="DONE">Sudah dilampirkan</option>
        </SelectNative>
      </div>

      <div className="space-y-1">
        <Label htmlFor={ids.from} className="text-xs">
          Tenggat dari
        </Label>
        <Input
          id={ids.from}
          name={name("from")}
          type="date"
          defaultValue={query.from ?? ""}
          onChange={submit}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={ids.to} className="text-xs">
          sampai
        </Label>
        <Input
          id={ids.to}
          name={name("to")}
          type="date"
          defaultValue={query.to ?? ""}
          onChange={submit}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={ids.sort} className="text-xs">
          Urutkan
        </Label>
        <SelectNative id={ids.sort} name={name("sort")} defaultValue={query.sort} onChange={submit}>
          {EVIDENCE_SORT_KEYS.map((key) => (
            <option key={key} value={key}>
              {EVIDENCE_SORTS[key]}
            </option>
          ))}
        </SelectNative>
      </div>

      <div className="space-y-1">
        <Label htmlFor={ids.per} className="text-xs">
          Tampilkan per halaman
        </Label>
        <SelectNative
          id={ids.per}
          name={name("per")}
          defaultValue={String(query.perPage)}
          onChange={submit}
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} item
            </option>
          ))}
        </SelectNative>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-5">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name={name("mine")}
            value="1"
            defaultChecked={query.mine}
            onChange={submit}
            className="size-4 rounded border-input accent-nid-orange-700"
          />
          Hanya permintaan untuk saya
        </label>

        {hasActiveEvidenceFilter(query) ? (
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link href={{ pathname: action, query: hidden }}>
              <RotateCcw aria-hidden />
              Reset
            </Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/**
 * Tabel permintaan evidence, dengan unggahan langsung dari barisnya.
 *
 * Unggahan cepat ada di sini supaya orang yang membuka dasbor untuk melihat apa yang
 * ditunggu darinya tidak perlu membuka CPAR-nya satu per satu hanya untuk melampirkan
 * satu berkas. Tautan ke CPAR-nya tetap ada — selalu ada hal yang hanya masuk akal
 * setelah melihat seluruh lembarnya.
 */
export function PendingEvidenceTable({
  rows,
  now,
}: {
  rows: readonly EvidenceRequestRow[];
  /** Waktu acuan dari server, supaya "lewat tenggat" sama di tabel dan di ringkasannya. */
  now: Date;
}) {
  if (rows.length === 0) return null;

  return (
    <ul className="divide-y divide-nid-border">
      {rows.map((row) => (
        <li key={row.key}>
          <EvidenceRow row={row} now={now} />
        </li>
      ))}
    </ul>
  );
}

function EvidenceRow({ row, now }: { row: EvidenceRequestRow; now: Date }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const completion = completionOf(row, now);
  const style = COMPLETION_STYLE[completion];
  const Icon = style.icon;

  async function upload(file: File) {
    setUploading(true);

    try {
      const sent = await submitUpload(
        file,
        (chosen) => {
          const formData = new FormData();
          formData.set("claimId", row.claimId);
          formData.set("file", chosen);

          if (row.kind === "INITIAL_DOCUMENT") formData.set("initialDocumentId", row.targetId);
          else formData.set("itemId", row.targetId);

          return formData;
        },
        row.kind === "INITIAL_DOCUMENT" ? uploadInitialDocument : uploadActionItemEvidence,
      );

      if (sent) router.refresh();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium">{row.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <Link href={`/cpar/${row.claimId}`} className="tabular text-nid-orange-700 hover:underline">
            {row.cparNo}
          </Link>
          {" · "}
          <span className="tabular">{row.claimNo}</span>
          {" · "}
          {row.sectionLabel}
          {" · "}
          {row.picName ?? "PIC belum ditunjuk"}
        </p>
      </div>

      <span className="flex items-center gap-1.5 text-xs tabular text-muted-foreground">
        <CalendarClock aria-hidden className="size-3.5" />
        {row.dueDate ? formatDate(row.dueDate) : "Tanpa tenggat"}
      </span>

      <span
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${style.className}`}
      >
        <Icon aria-hidden className="size-3" />
        {COMPLETION_LABEL[completion]}
        {row.fileCount > 1 ? ` (${row.fileCount})` : ""}
      </span>

      {row.canUpload ? (
        <>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT_EVIDENCE}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />

          <Button
            type="button"
            size="sm"
            variant={completion === "DONE" ? "ghost" : "outline"}
            disabled={uploading}
            aria-label={`Upload evidence untuk ${row.title}`}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? <Loader2 aria-hidden className="animate-spin" /> : <FileUp aria-hidden />}
            Upload
          </Button>
        </>
      ) : null}
    </div>
  );
}
