"use client";

import { useMemo, useState } from "react";
import { FileArchive, FileWarning, Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatSize } from "@/lib/uploads";

export interface PackageItemView {
  readonly id: string;
  readonly label: string;
  readonly originalName: string;
  readonly sizeBytes: number;
  readonly uploadedByName: string;
}

export interface PackageGroupView {
  readonly folder: string;
  readonly items: readonly PackageItemView[];
}

/**
 * Pop-up pemilihan isi paket klaim.
 *
 * Seluruh evidence tercentang sejak awal: paket yang diminta orang hampir selalu paket
 * lengkap, dan pilihan dipakai untuk **membuang** yang tidak perlu — foto mentah yang
 * berat, atau lampiran internal yang tidak untuk pelanggan. Memulai dari kosong berarti
 * tiap paket lengkap menuntut dua puluh klik.
 *
 * Yang dikirim adalah form biasa, bukan fetch: unduhannya ditangani peramban sendiri,
 * sehingga tidak ada arsip puluhan megabyte yang harus disusun dulu sebagai blob di
 * memori peramban ponsel.
 */
export function ClaimPackageDialog({
  claimId,
  groups,
  documentCount,
  missingDocuments,
}: {
  claimId: string;
  groups: readonly PackageGroupView[];
  documentCount: number;
  missingDocuments: readonly string[];
}) {
  const allIds = useMemo(
    () => groups.flatMap((group) => group.items.map((item) => item.id)),
    [groups],
  );

  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(allIds));
  const [open, setOpen] = useState(false);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleGroup = (group: PackageGroupView, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const item of group.items) {
        if (checked) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });

  const chosenBytes = groups
    .flatMap((group) => group.items)
    .filter((item) => selected.has(item.id))
    .reduce((sum, item) => sum + item.sizeBytes, 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Package aria-hidden />
          Download claim package
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Download claim package</DialogTitle>
          <DialogDescription>
            Seluruh lembar cetak dan evidence klaim ini dalam satu arsip ZIP, tersusun
            dalam folder per bagian. Hilangkan centang pada evidence yang tidak perlu ikut.
          </DialogDescription>
        </DialogHeader>

        <form
          method="POST"
          action={`/api/claims/${claimId}/package`}
          className="space-y-4"
          /*
            Pop-up ditutup setelah jeda, bukan pada klik yang sama.
            Menutupnya seketika — misalnya lewat DialogClose — melepas form dari DOM di
            tik yang sama dengan submit-nya, dan peramban membatalkan permintaan yang
            belum sempat berangkat. Gejalanya menyesatkan: tombolnya bekerja, pop-upnya
            menutup, dan tidak ada apa pun yang terunduh.
          */
          onSubmit={() => {
            window.setTimeout(() => setOpen(false), 800);
          }}
        >
          {/*
            Pilihannya dikirim sebagai input tersembunyi yang digambar dari state, bukan
            lewat checkbox-nya langsung: komponen checkbox portal ini bukan input asli,
            dan form biasa hanya mengirim apa yang benar-benar ada di DOM sebagai input.
          */}
          {[...selected].map((id) => (
            <input key={id} type="hidden" name="attachment" value={id} />
          ))}

          <div className="rounded-lg border border-nid-border px-3 py-2.5 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <FileArchive aria-hidden className="size-4 text-muted-foreground" />
              {documentCount} lembar cetak
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Bad News, Quick Information, CPAR, Monitoring, dan A3 yang sudah pernah dibuat.
              Selalu ikut — ini isi pokok paketnya.
            </p>
          </div>

          {missingDocuments.length > 0 ? (
            <p className="flex items-start gap-2 rounded-lg bg-[var(--status-pending-bg)] px-3 py-2 text-xs text-[var(--status-pending)]">
              <FileWarning aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Belum pernah dibuat, jadi tidak ada di paket: {missingDocuments.join(", ")}.
                Alasannya tertulis juga di <code>ISI-PAKET.txt</code> di dalam arsip.
              </span>
            </p>
          ) : null}

          {groups.length === 0 ? (
            <p className="rounded-lg border border-dashed border-nid-border px-3 py-6 text-center text-sm text-muted-foreground">
              Belum ada evidence yang dilampirkan pada klaim ini.
            </p>
          ) : (
            <div className="max-h-[40vh] space-y-3 overflow-y-auto pr-1">
              {groups.map((group) => {
                const chosen = group.items.filter((item) => selected.has(item.id)).length;
                const all = chosen === group.items.length;

                return (
                  <section key={group.folder} className="rounded-lg border border-nid-border">
                    <header className="flex items-center gap-2.5 border-b border-nid-border px-3 py-2">
                      <Checkbox
                        id={`group-${group.folder}`}
                        checked={all ? true : chosen > 0 ? "indeterminate" : false}
                        onCheckedChange={(value) => toggleGroup(group, value !== false)}
                      />
                      <label
                        htmlFor={`group-${group.folder}`}
                        className="min-w-0 flex-1 cursor-pointer text-sm font-medium"
                      >
                        {group.folder}
                      </label>
                      <span className="shrink-0 text-xs tabular text-muted-foreground">
                        {chosen}/{group.items.length}
                      </span>
                    </header>

                    <ul className="divide-y divide-nid-border">
                      {group.items.map((item) => (
                        <li key={item.id} className="flex items-start gap-2.5 px-3 py-2">
                          <Checkbox
                            id={`item-${item.id}`}
                            className="mt-0.5"
                            checked={selected.has(item.id)}
                            onCheckedChange={() => toggle(item.id)}
                          />
                          <label
                            htmlFor={`item-${item.id}`}
                            className="min-w-0 flex-1 cursor-pointer"
                          >
                            <span className="block break-words text-sm">{item.label}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {item.originalName} · {formatSize(item.sizeBytes)} ·{" "}
                              {item.uploadedByName}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}

          <DialogFooter className="items-center gap-2 sm:justify-between">
            <p className="text-xs tabular text-muted-foreground">
              {selected.size} dari {allIds.length} evidence · {formatSize(chosenBytes)}
            </p>

            <div className="flex flex-wrap gap-2">
              {allIds.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSelected(selected.size === allIds.length ? new Set() : new Set(allIds))
                  }
                >
                  {selected.size === allIds.length ? "Kosongkan" : "Pilih semua"}
                </Button>
              ) : null}

              <Button type="submit">
                <Package aria-hidden />
                Download ZIP
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
