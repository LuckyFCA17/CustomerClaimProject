import type { ReactNode } from "react";

import { formatDate, formatDateTime } from "@/lib/format";

/**
 * Form 5 (R3) PR-QA-ISO-07 — Bad News Information (Quality Alert).
 *
 * Tata letaknya meniru formulir terkendali NID apa adanya, termasuk urutan baris,
 * pembagian kolom, dan kalimat peringatan berbahasa Indonesia yang sudah tercetak di
 * sana. Ejaan "PROBLEM HYSTORY" juga dipertahankan: itu teks pada dokumen terkendali,
 * dan memperbaikinya di sini justru membuat lembar hasil portal berbeda dari master
 * yang dipegang auditor.
 *
 * Komponennya terpisah dari print/sheet.tsx karena formulir ini mendatar dan berbasis
 * tabel rapat, sementara dokumen lain tegak dan berbasis blok.
 */

const INK = "#1f2933";
const BORDER = `0.3mm solid ${INK}`;

export interface SocializationGroup {
  readonly label: string;
}

/** Penanda revisi ISO pada formulir aslinya: segitiga kecil berisi nomor revisi. */
export function RevisionMark({ revision = 3 }: { revision?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-grid",
        placeItems: "center",
        width: "3.2mm",
        height: "3.2mm",
        fontSize: "5pt",
        fontWeight: 700,
        clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)",
        border: `0.2mm solid ${INK}`,
        lineHeight: 1,
        paddingTop: "0.8mm",
      }}
    >
      {revision}
    </span>
  );
}

export function Cell({
  children,
  align = "left",
  bold = false,
  colSpan,
  rowSpan,
  width,
  color,
  background,
  fontSize,
  className,
}: {
  children?: ReactNode;
  align?: "left" | "center" | "right";
  bold?: boolean;
  colSpan?: number;
  rowSpan?: number;
  width?: string;
  color?: string;
  background?: string;
  fontSize?: string;
  className?: string;
}) {
  return (
    <td
      colSpan={colSpan}
      rowSpan={rowSpan}
      className={className}
      style={{
        border: BORDER,
        padding: "0.6mm 1.2mm",
        textAlign: align,
        fontWeight: bold ? 700 : 400,
        width,
        color,
        background,
        fontSize,
        verticalAlign: "middle",
      }}
    >
      {children ?? " "}
    </td>
  );
}

/** Kop formulir: logo, judul, nomor BNI, dan tanggal terbit. */
export function FormMasthead({
  documentNo,
  issueDate,
}: {
  documentNo: string;
  issueDate: Date | null;
}) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
      <tbody>
        <tr>
          <Cell rowSpan={2} width="14%" align="center">
            <span
              style={{
                fontFamily: "var(--font-poppins), sans-serif",
                fontSize: "15pt",
                fontWeight: 700,
                letterSpacing: "0.02em",
              }}
            >
              NIFCO
            </span>
          </Cell>
          <Cell rowSpan={2} width="66%" align="center">
            <div style={{ fontSize: "13pt", fontWeight: 700 }}>BAD NEWS INFORMATION</div>
            <div style={{ fontSize: "12pt", fontWeight: 700 }}>
              ( <span style={{ color: "#d00" }}>QUALITY ALERT</span> )
            </div>
          </Cell>
          <Cell width="8%" align="right" bold fontSize="6.5pt">
            BNI No.
          </Cell>
          <Cell width="12%" align="center" bold>
            {documentNo}
          </Cell>
        </tr>
        <tr>
          <Cell align="right" bold fontSize="6.5pt">
            Issue Date
          </Cell>
          <Cell align="center">{issueDate ? formatDate(issueDate) : " "}</Cell>
        </tr>
      </tbody>
    </table>
  );
}

export interface SignatureSlot {
  readonly name: string | null;
  readonly at: Date | null;
}

/**
 * Pita tanda tangan.
 *
 * Kolom PREPARED dan APPROVED diisi portal beserta waktu persetujuan digitalnya (§9).
 * Kolom CHECKED, ACKNOWLEDGED, dan RESPONSIBLE sengaja dibiarkan kosong: portal tidak
 * mengetahui siapa yang membubuhkan paraf di lantai produksi, dan mengisinya dengan
 * tebakan akan membuat lembar ini berbohong.
 */
export function SignatureStrip({
  prepared,
  approved,
  period,
  responsible,
}: {
  prepared: SignatureSlot;
  approved: SignatureSlot;
  period: { month: string; year: string };
  responsible: string | null;
}) {
  const signatureHeight = "9mm";

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
      <tbody>
        <tr>
          <Cell width="10%" align="center" bold fontSize="7pt">
            <span style={{ display: "inline-flex", alignItems: "center", gap: "1mm" }}>
              <RevisionMark /> ISSUE
            </span>
          </Cell>
          <Cell colSpan={2} width="20%" align="center" bold fontSize="7pt">
            QA-ISO
          </Cell>
          <Cell width="9%" />
          <Cell colSpan={2} width="10%" align="center" bold fontSize="7pt">
            PERIOD
          </Cell>
          <Cell width="9%" />
          <Cell colSpan={3} width="30%" align="center" bold fontSize="7pt">
            ACKNOWLEDGED
          </Cell>
          <Cell width="12%" align="center" bold fontSize="7pt">
            RESPONSIBLE
          </Cell>
        </tr>

        <tr>
          <Cell align="center" color="#1d4ed8" fontSize="6.5pt">
            PREPARED
          </Cell>
          <Cell align="center" color="#1d4ed8" fontSize="6.5pt">
            CHECKED
          </Cell>
          <Cell align="center" color="#1d4ed8" fontSize="6.5pt">
            APPROVED
          </Cell>
          <Cell rowSpan={3} />
          <Cell rowSpan={2} align="center" bold fontSize="11pt">
            {period.month}
          </Cell>
          <Cell rowSpan={2} align="center" bold fontSize="11pt">
            {period.year}
          </Cell>
          <Cell rowSpan={3} />
          <Cell align="center" color="#1d4ed8" fontSize="6.5pt">
            QC
          </Cell>
          <Cell align="center" color="#1d4ed8" fontSize="6.5pt">
            PPIC
          </Cell>
          <Cell align="center" color="#1d4ed8" fontSize="6.5pt">
            PRODUCTION
          </Cell>
          <Cell align="center" color="#d00" fontSize="6.5pt">
            {responsible ?? " "}
          </Cell>
        </tr>

        <tr style={{ height: signatureHeight }}>
          <Cell align="center" fontSize="5.5pt" color="#6b7280">
            {prepared.at ? formatDateTime(prepared.at) : " "}
          </Cell>
          <Cell />
          <Cell align="center" fontSize="5.5pt" color="#6b7280">
            {approved.at ? formatDateTime(approved.at) : " "}
          </Cell>
          <Cell />
          <Cell />
          <Cell />
          <Cell rowSpan={2} />
        </tr>

        <tr>
          <Cell align="center" bold>
            {prepared.name ?? " "}
          </Cell>
          <Cell />
          <Cell align="center" bold>
            {approved.name ?? " "}
          </Cell>
          <Cell align="center" bold />
          <Cell align="center" bold />
          <Cell align="center" bold />
          <Cell align="center" bold />
          <Cell align="center" bold />
        </tr>
      </tbody>
    </table>
  );
}

export function SectionBar({
  letter,
  title,
  width,
}: {
  letter: string;
  title: string;
  width?: string;
}) {
  return (
    <table style={{ width: width ?? "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
      <tbody>
        <tr>
          <Cell width="6%" align="center" bold background="#d9d9d9" fontSize="11pt" color="#1d4ed8">
            {letter}
          </Cell>
          <Cell align="center">
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "2mm",
                fontSize: "11pt",
                fontWeight: 700,
                color: "#1d4ed8",
              }}
            >
              <RevisionMark /> {title}
            </span>
          </Cell>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * Section C — Socialization.
 *
 * Grid paraf yang ditandatangani operator di lantai produksi, bukan diisi portal:
 * lembar ini dicetak lalu diedarkan per grup kerja. Barisnya karena itu sengaja kosong,
 * sama seperti formulir aslinya.
 */
export function SocializationGrid({
  groups = ["A", "B", "C"],
  rows = 11,
}: {
  groups?: readonly string[];
  rows?: number;
}) {
  const rowIndexes = Array.from({ length: rows }, (_, index) => index);

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
      <thead>
        <tr>
          {groups.map((group) => (
            <HeaderGroup key={group} />
          ))}
          <Cell width="5%" align="center" bold fontSize="6pt">
            OTHERS
          </Cell>
          <Cell width="5%" align="center" bold fontSize="6pt">
            DEPT
          </Cell>
          <Cell width="10%" align="center" bold fontSize="6pt">
            NAME
          </Cell>
          <Cell width="5%" align="center" bold fontSize="6pt">
            PARAF
          </Cell>
        </tr>
      </thead>
      <tbody>
        {rowIndexes.map((index) => (
          <tr key={index} style={{ height: "4.2mm" }}>
            {groups.map((group) => (
              <GroupRow key={group} group={group} index={index} rows={rows} />
            ))}

            {index === 0 ? (
              <Cell rowSpan={rows} align="center" bold fontSize="6.5pt">
                Related
                <br />
                Section
                <br />
                Process
                <br />
                Control
              </Cell>
            ) : null}
            <Cell />
            <Cell />
            <Cell />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HeaderGroup() {
  return (
    <>
      <Cell width="5%" align="center" bold fontSize="6pt">
        GROUP
      </Cell>
      <Cell width="5%" align="center" bold fontSize="6pt">
        DEPT
      </Cell>
      <Cell width="11%" align="center" bold fontSize="6pt">
        OPERATOR
      </Cell>
      <Cell width="5%" align="center" bold fontSize="6pt">
        PARAF
      </Cell>
    </>
  );
}

function GroupRow({ group, index, rows }: { group: string; index: number; rows: number }) {
  return (
    <>
      {index === 0 ? (
        <Cell rowSpan={rows} align="center" bold fontSize="20pt">
          {group}
        </Cell>
      ) : null}
      <Cell />
      <Cell />
      <Cell />
    </>
  );
}
