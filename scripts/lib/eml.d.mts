/**
 * Tipe untuk `eml.mjs`.
 *
 * Skrip di `scripts/` ditulis sebagai JavaScript biasa supaya dapat dijalankan `node`
 * langsung, tanpa transpiler — penting di Termux, tempat perkakas tambahan sering tidak
 * tersedia. Deklarasi ini yang membuat `pnpm typecheck` dan unit test tetap mengenali
 * bentuk datanya.
 */

export interface EmlAttachment {
  readonly filename: string;
  readonly mime: string;
  readonly content: Buffer;
}

export interface ParsedEml {
  readonly from: string;
  readonly to: readonly string[];
  readonly cc: readonly string[];
  readonly subject: string;
  readonly messageId: string;
  /** `null` bila header Date tidak ada atau tidak dapat dibaca. */
  readonly date: Date | null;
  readonly html: string;
  readonly text: string;
  readonly attachments: readonly EmlAttachment[];
}

/** Membuka header berkodekan RFC 2047; nilai biasa dikembalikan apa adanya. */
export function decodeHeaderValue(value: string | undefined): string;

/** Membaca satu berkas .eml. Tidak pernah melempar. */
export function parseEml(raw: string): ParsedEml;
