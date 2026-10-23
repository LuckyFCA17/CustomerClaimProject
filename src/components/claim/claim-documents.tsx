import { FileText } from "lucide-react";

import { formatDateTime } from "@/lib/format";
import { DOCUMENT_TITLE } from "@/lib/pdf";
import type { DocumentKind } from "@/generated/prisma/enums";

export interface ClaimDocument {
  readonly id: string;
  readonly kind: DocumentKind;
  readonly version: number;
  readonly path: string;
  readonly isDraft: boolean;
  readonly generatedAt: Date;
}

/**
 * Dokumen yang pernah dicetak untuk sebuah klaim (§9).
 *
 * Versi lama tetap ditampilkan, bukan ditimpa: PDF yang sudah terkirim ke pelanggan
 * harus tetap dapat ditelusuri apa isinya saat itu.
 */
export function ClaimDocuments({ documents }: { documents: readonly ClaimDocument[] }) {
  if (documents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Belum ada dokumen. PDF dicetak otomatis saat klaim dikirim dan saat disetujui.
      </p>
    );
  }

  const latest = new Map<DocumentKind, number>();
  for (const document of documents) {
    latest.set(document.kind, Math.max(latest.get(document.kind) ?? 0, document.version));
  }

  return (
    <ul className="divide-y divide-nid-border">
      {documents.map((document) => {
        const isLatest = latest.get(document.kind) === document.version;

        return (
          <li key={document.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 first:pt-0">
            <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />

            <a
              href={`/api/files/${document.path}`}
              target="_blank"
              rel="noopener"
              className="text-sm font-medium text-nid-orange-700 hover:underline"
            >
              {DOCUMENT_TITLE[document.kind]}
            </a>

            <span className="text-xs tabular text-muted-foreground">v{document.version}</span>

            {document.isDraft ? (
              <span className="rounded-full bg-[var(--status-draft-bg)] px-2 py-0.5 text-[11px] text-[var(--status-draft)]">
                DRAFT
              </span>
            ) : null}

            {!isLatest ? (
              <span className="text-[11px] text-muted-foreground">versi lama</span>
            ) : null}

            <span className="ml-auto text-xs tabular text-muted-foreground">
              {formatDateTime(document.generatedAt)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
