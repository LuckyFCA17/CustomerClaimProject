import type { ReactNode } from "react";

import { formatDateTime } from "@/lib/format";

/**
 * Komponen bersama seluruh dokumen cetak (§9).
 *
 * Setiap PDF wajib memuat kop NIFCO, judul form, nomor dokumen, tanggal cetak, status,
 * dan blok tanda tangan digital. Dikumpulkan di satu berkas agar kelima dokumen tidak
 * perlahan berbeda satu sama lain.
 */

export function Sheet({ draft, children }: { draft?: boolean; children: ReactNode }) {
  return (
    <section className="sheet" data-draft={draft ? "true" : undefined}>
      {children}
    </section>
  );
}

export function FormHeader({
  formTitle,
  formCode,
  documentNo,
  status,
  printedAt,
}: {
  formTitle: string;
  formCode: string;
  documentNo: string;
  status: string;
  printedAt: Date;
}) {
  return (
    <header className="mb-[6mm] border-b-2 border-[#1f2933] pb-[4mm]">
      <div className="flex items-start justify-between gap-[8mm]">
        <div className="flex items-center gap-[4mm]">
          <span className="grid size-[14mm] shrink-0 place-items-center rounded-[2mm] bg-[#e8873a] font-display text-[11pt] font-bold text-white">
            NC
          </span>
          <div className="leading-tight">
            <div className="font-display text-[13pt] font-bold tracking-wide">PT NIFCO INDONESIA</div>
            <div className="text-[8pt] text-[#6b7280]">Quality Assurance Department</div>
          </div>
        </div>

        <div className="text-right leading-tight">
          <div className="font-display text-[12pt] font-bold uppercase text-[#b45a15]">{formTitle}</div>
          <div className="text-[8pt] text-[#6b7280]">{formCode}</div>
        </div>
      </div>

      <div className="mt-[4mm] flex flex-wrap items-end justify-between gap-x-[8mm] gap-y-[2mm] text-[8.5pt]">
        <div>
          <span className="text-[#6b7280]">No. Dokumen </span>
          <span className="font-semibold tabular">{documentNo}</span>
        </div>
        <div>
          <span className="text-[#6b7280]">Status </span>
          <span className="font-semibold">{status}</span>
        </div>
        <div>
          <span className="text-[#6b7280]">Dicetak </span>
          <span className="tabular">{formatDateTime(printedAt)} WIB</span>
        </div>
      </div>
    </header>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-[2mm] mt-[5mm] border-l-[1.2mm] border-[#e8873a] bg-[#f4f5f7] px-[3mm] py-[1.5mm] font-display text-[9.5pt] font-semibold uppercase tracking-wide first:mt-0">
      {children}
    </h2>
  );
}

/** Tabel label–nilai dua kolom; nilai kosong tetap ditampilkan sebagai garis isian. */
export function FieldGrid({
  rows,
  columns = 2,
}: {
  rows: readonly (readonly [string, string | null | undefined])[];
  columns?: 1 | 2;
}) {
  return (
    <table className="w-full border-collapse text-[9pt]">
      <tbody>
        {chunk(rows, columns).map((group, index) => (
          <tr key={index}>
            {group.map(([label, value]) => (
              <td
                key={label}
                className="w-1/2 border border-[#e4e7eb] px-[3mm] py-[1.8mm] align-top"
                colSpan={group.length === 1 && columns === 2 ? 2 : 1}
              >
                <div className="text-[7.5pt] uppercase tracking-wide text-[#6b7280]">{label}</div>
                <div className="mt-[0.5mm] whitespace-pre-line break-words">{value || "—"}</div>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

export interface Signatory {
  readonly role: string;
  readonly name: string | null;
  readonly jobTitle: string | null;
  readonly approvedAt: Date | null;
}

/**
 * Blok tanda tangan (§9, asumsi A-13).
 *
 * Tidak ada gambar tanda tangan: yang dicetak adalah nama, jabatan, dan waktu persetujuan
 * yang tercatat portal. Kolom yang belum disetujui tetap dicetak kosong supaya lembarnya
 * tidak berubah tinggi setelah ditandatangani.
 */
export function SignatureBlock({ signatories }: { signatories: readonly Signatory[] }) {
  return (
    <div className="mt-[6mm]">
      <table className="w-full border-collapse text-center text-[8.5pt]">
        <tbody>
          <tr>
            {signatories.map((signatory) => (
              <td key={signatory.role} className="border border-[#e4e7eb] px-[3mm] py-[2mm] align-top">
                <div className="text-[7.5pt] uppercase tracking-wide text-[#6b7280]">{signatory.role}</div>

                <div className="mt-[8mm] border-t border-[#1f2933] pt-[1.5mm]">
                  <div className="font-semibold">{signatory.name ?? " "}</div>
                  <div className="text-[7.5pt] text-[#6b7280]">{signatory.jobTitle ?? " "}</div>
                  <div className="mt-[0.5mm] text-[7pt] tabular text-[#6b7280]">
                    {signatory.approvedAt ? formatDateTime(signatory.approvedAt) : " "}
                  </div>
                </div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <p className="mt-[2mm] text-[7.5pt] italic text-[#6b7280]">
        Approved electronically via NCC Portal — dokumen ini sah tanpa tanda tangan basah.
      </p>
    </div>
  );
}

const PHOTO_HEIGHT = { normal: "h-[32mm]", large: "h-[52mm]" } as const;
const PHOTO_COLUMNS = ["grid-cols-1", "grid-cols-1", "grid-cols-2", "grid-cols-3"] as const;

/**
 * Deretan foto part.
 *
 * Jumlah kolom mengikuti jumlah foto, bukan selalu tiga: satu foto yang dipaksa masuk
 * kolom sepertiga tercetak kecil dan sulit dibaca dari jarak baca kertas — padahal
 * fotolah isi terpenting lembar ini.
 */
export function PhotoRow({
  photos,
  emptyLabel = "Tidak ada foto",
  size = "normal",
}: {
  photos: readonly { id: string; src: string; caption: string | null }[];
  emptyLabel?: string;
  size?: keyof typeof PHOTO_HEIGHT;
}) {
  const height = PHOTO_HEIGHT[size];

  if (photos.length === 0) {
    return (
      <div
        className={`grid ${height} place-items-center border border-dashed border-[#e4e7eb] text-[8pt] text-[#6b7280]`}
      >
        {emptyLabel}
      </div>
    );
  }

  const shown = photos.slice(0, 3);

  return (
    <div className={`grid ${PHOTO_COLUMNS[shown.length]} gap-[2mm]`}>
      {shown.map((photo) => (
        <figure key={photo.id} className="m-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- Puppeteer mencetak
              halaman statis; pengoptimal gambar Next tidak ikut berjalan di sana. */}
          <img
            src={photo.src}
            alt={photo.caption ?? ""}
            className={`${height} w-full rounded-[1mm] border border-[#e4e7eb] object-cover`}
          />
          {photo.caption ? (
            <figcaption className="mt-[0.8mm] text-[7pt] leading-tight text-[#6b7280]">
              {photo.caption}
            </figcaption>
          ) : null}
        </figure>
      ))}
    </div>
  );
}
