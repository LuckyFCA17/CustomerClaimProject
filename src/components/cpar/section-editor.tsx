"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Link2, Loader2, Lock, Pencil, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CparSectionKey } from "@/generated/prisma/enums";
import { SECTION_HINT, SECTION_INDEX, SECTION_LABEL } from "@/lib/cpar";
import { formatDateTime } from "@/lib/format";
import { saveCparSection } from "@/server/actions/cpar-filling";

export interface SectionView {
  readonly key: CparSectionKey;
  readonly content: string | null;
  readonly isRequired: boolean;
  readonly revisionNote: string | null;
  readonly lockedAt: Date | null;
  readonly filledByName: string | null;
  readonly filledAt: Date | null;
  /** Dihitung di server dari `canFillSection`; UI tidak menebak sendiri. */
  readonly canFill: boolean;
}

/**
 * Alasan section terkunci, diturunkan dari status klaim.
 *
 * `lockedAt` saja tidak cukup untuk menjelaskannya: section tetap terkunci setelah CPAR
 * disetujui, dan menuliskan "menunggu hasil verifikasi" di sana akan memberi tahu orang
 * bahwa masih ada yang ditunggu padahal sudah tidak ada.
 */
export type LockReason = "VERIFYING" | "APPROVED";

const LOCK_TEXT: Record<LockReason, { badge: string; body: string }> = {
  VERIFYING: {
    badge: "Terkunci selama CPAR diverifikasi",
    body: "Menunggu hasil verifikasi",
  },
  APPROVED: {
    badge: "Terkunci karena CPAR sudah disetujui",
    body: "CPAR sudah disetujui",
  },
};

/**
 * Tujuh section CPAR (§6 Modul 3).
 *
 * Section yang bukan hak pengguna tampil read-only, bukan disembunyikan: pengisi satu
 * bagian perlu membaca bagian lain untuk menulis bagiannya sendiri — root cause outflow
 * sulit ditulis tanpa melihat problem description.
 *
 * Yang menolak penulisan tetap server action; `canFill` di sini hanya menentukan apakah
 * tombolnya digambar.
 */
export function SectionEditor({
  claimId,
  sections,
  lockReason,
  derived,
}: {
  claimId: string;
  sections: readonly SectionView[];
  lockReason: LockReason;
  /** Isi siap-pakai untuk section yang diturunkan dari klaim, bukan diketik. */
  derived?: Partial<Record<CparSectionKey, React.ReactNode>>;
}) {
  return (
    <ol className="space-y-4">
      {sections.map((section) => (
        <li key={section.key}>
          <SectionCard
            claimId={claimId}
            section={section}
            lockReason={lockReason}
            derivedContent={derived?.[section.key]}
          />
        </li>
      ))}
    </ol>
  );
}

function SectionCard({
  claimId,
  section,
  lockReason,
  derivedContent,
}: {
  claimId: string;
  section: SectionView;
  lockReason: LockReason;
  derivedContent?: React.ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section.content ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filled = (section.content ?? "").trim().length > 0;
  const locked = section.lockedAt !== null;
  const lockText = LOCK_TEXT[lockReason];

  async function save() {
    setError(null);
    setSaving(true);

    try {
      const result = await saveCparSection(claimId, { key: section.key, content: draft });

      if (!result.ok) {
        setError(result.fieldErrors?.content?.[0] ?? result.message ?? "Gagal menyimpan.");
        return;
      }

      toast.success("Section tersimpan", { description: result.message });
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="rounded-lg border border-nid-border bg-card">
      <header className="flex flex-wrap items-start gap-x-3 gap-y-1.5 border-b border-nid-border px-4 py-3">
        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold tabular">
          {SECTION_INDEX[section.key]}
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="font-medium">{SECTION_LABEL[section.key]}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{SECTION_HINT[section.key]}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {locked && !derivedContent ? (
            <span
              title={lockText.badge}
              className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              <Lock aria-hidden className="size-3" />
              Terkunci
            </span>
          ) : null}

          {derivedContent ? (
            <span className="flex items-center gap-1 rounded-full bg-[var(--status-published-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--status-published)]">
              <Link2 aria-hidden className="size-3" />
              Dari data klaim
            </span>
          ) : (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{
                backgroundColor: filled ? "var(--status-closed-bg)" : "var(--status-draft-bg)",
                color: filled ? "var(--status-closed)" : "var(--status-draft)",
              }}
            >
              {filled ? "Terisi" : "Kosong"}
            </span>
          )}
        </div>
      </header>

      {section.revisionNote ? (
        <p className="flex gap-2 border-b border-nid-border bg-[var(--status-pending-bg)] px-4 py-2.5 text-sm text-[var(--status-pending)]">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong className="font-medium">Diminta diperbaiki: </strong>
            {section.revisionNote}
          </span>
        </p>
      ) : null}

      <div className="px-4 py-3">
        {derivedContent ? (
          derivedContent
        ) : editing ? (
          <div className="space-y-2">
            <Textarea
              rows={6}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={SECTION_HINT[section.key]}
              aria-label={SECTION_LABEL[section.key]}
            />

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

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
                  setDraft(section.content ?? "");
                  setError(null);
                  setEditing(false);
                }}
              >
                Batal
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="whitespace-pre-line break-words text-sm">
              {filled ? (
                section.content
              ) : (
                <span className="text-muted-foreground">Belum diisi.</span>
              )}
            </p>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              {section.filledByName ? (
                <span className="text-xs text-muted-foreground">
                  Diisi {section.filledByName}
                  {section.filledAt ? ` · ${formatDateTime(section.filledAt)}` : ""}
                </span>
              ) : null}

              {section.canFill && !locked ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="ml-auto"
                  onClick={() => setEditing(true)}
                >
                  <Pencil aria-hidden />
                  {filled ? "Ubah" : "Isi section"}
                </Button>
              ) : (
                <span className="ml-auto text-xs text-muted-foreground">
                  {locked ? lockText.body : "Hanya dapat dibaca"}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </article>
  );
}
