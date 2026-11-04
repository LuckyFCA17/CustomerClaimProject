import type { ReactNode } from "react";

/**
 * Primitif email.
 *
 * Ditulis sendiri, bukan memakai @react-email/components — npm menandai paket itu
 * "no longer supported" pada seluruh versinya. Yang dipakai di sini adalah
 * @react-email/render, yaitu perender React Email yang masih didukung.
 *
 * Semua tata letak memakai tabel dan atribut lawas karena klien email korporat
 * (Outlook pada Windows khususnya) tidak dapat diandalkan untuk flexbox maupun grid.
 */

export const COLORS = {
  orange: "#e8873a",
  orangeDark: "#b45a15",
  ink: "#1f2933",
  muted: "#6b7280",
  border: "#e4e7eb",
  surface: "#f4f5f7",
  card: "#ffffff",
} as const;

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function EmailShell({
  preview,
  heading,
  children,
}: {
  preview: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <html lang="id">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light" />
        <title>{heading}</title>
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: COLORS.surface,
          fontFamily: FONT_STACK,
          color: COLORS.ink,
        }}
      >
        {/* Teks pratinjau di daftar kotak masuk; disembunyikan dari badan email. */}
        <div
          style={{
            display: "none",
            overflow: "hidden",
            lineHeight: "1px",
            opacity: 0,
            maxHeight: 0,
            maxWidth: 0,
          }}
        >
          {preview}
        </div>

        <table width="100%" cellPadding={0} cellSpacing={0} role="presentation" style={{ backgroundColor: COLORS.surface }}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: "24px 12px" }}>
                <div data-mso="open" />
                <div style={{ maxWidth: "600px", margin: "0 auto" }}>
                <table
                  width="100%"
                  cellPadding={0}
                  cellSpacing={0}
                  role="presentation"
                  style={{ width: "100%", backgroundColor: COLORS.card, borderRadius: "12px", overflow: "hidden", border: `1px solid ${COLORS.border}` }}
                >
                  <tbody>
                    <tr>
                      <td style={{ backgroundColor: COLORS.orange, padding: "20px 24px" }}>
                        <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
                          <tbody>
                            <tr>
                              <td>
                                <div style={{ color: "#ffffff", fontSize: "13px", fontWeight: 700, letterSpacing: "0.04em" }}>
                                  NCC PORTAL
                                </div>
                                <div style={{ color: "rgba(255,255,255,0.8)", fontSize: "11px" }}>
                                  NIFCO Customer Claim · PT Nifco Indonesia
                                </div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>

                    <tr>
                      <td style={{ padding: "24px" }}>
                        <h1 style={{ margin: "0 0 14px", fontSize: "19px", lineHeight: 1.3, color: COLORS.orangeDark }}>
                          {heading}
                        </h1>
                        {children}
                      </td>
                    </tr>

                    <tr>
                      <td style={{ padding: "16px 24px", borderTop: `1px solid ${COLORS.border}`, backgroundColor: COLORS.surface }}>
                        <p style={{ margin: 0, fontSize: "11px", color: COLORS.muted, lineHeight: 1.5 }}>
                          Email ini dikirim otomatis oleh NCC Portal. Mohon tidak membalas email ini —
                          gunakan portal untuk menanggapi.
                        </p>
                      </td>
                    </tr>
                  </tbody>
                </table>
                </div>
                <div data-mso="close" />
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

/**
 * Memasang lebar tetap khusus Outlook pada Windows.
 *
 * Kartu email dibuat cair (`width:100%` dengan `max-width:600px` pada div pembungkus)
 * supaya muat di layar ponsel. Mesin render Outlook pada Windows adalah Word, dan Word
 * mengabaikan `max-width` sama sekali — tanpa penyeimbang, email yang cair akan melebar
 * mengikuti lebar jendela Outlook yang dimaksimalkan.
 *
 * Penyeimbangnya adalah "ghost table": tabel 600px yang hanya terlihat oleh Outlook,
 * dibungkus conditional comment. React tidak dapat menghasilkan simpul komentar, jadi
 * `EmailShell` menanam dua div penanda dan komentarnya dipasang di sini, pada HTML yang
 * sudah jadi. Diuji di `tests/unit/email-shell.test.ts`.
 */
const MSO_OPEN =
  '<!--[if mso]><table width="600" cellpadding="0" cellspacing="0" role="presentation" align="center"><tr><td><![endif]-->';
const MSO_CLOSE = "<!--[if mso]></td></tr></table><![endif]-->";

export function withOutlookGhostTable(html: string): string {
  return html
    .replace(/<div data-mso="open"[^>]*><\/div>/g, MSO_OPEN)
    .replace(/<div data-mso="close"[^>]*><\/div>/g, MSO_CLOSE);
}

export function Paragraph({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: "0 0 14px", fontSize: "14px", lineHeight: 1.6, color: COLORS.ink, overflowWrap: "break-word" }}>
      {children}
    </p>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <table width="100%" cellPadding={0} cellSpacing={0} role="presentation" style={{ margin: "0 0 18px" }}>
      <tbody>
        <tr>
          <td
            style={{
              padding: "12px 14px",
              backgroundColor: "#fef3c7",
              borderLeft: "3px solid #b45309",
              borderRadius: "6px",
              fontSize: "13px",
              lineHeight: 1.6,
              color: COLORS.ink,
              whiteSpace: "pre-line",
            }}
          >
            {children}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** Ringkasan klaim dalam tabel (§8). Baris bernilai kosong dibuang, bukan ditampilkan "—". */
export function SummaryTable({ rows }: { rows: readonly (readonly [string, string | null])[] }) {
  const visible = rows.filter((row): row is readonly [string, string] => Boolean(row[1]));

  return (
    <table
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      role="presentation"
      style={{ margin: "0 0 20px", border: `1px solid ${COLORS.border}`, borderRadius: "8px" }}
    >
      <tbody>
        {visible.map(([label, value], index) => (
          <tr key={label}>
            <td
              style={{
                // Persentase, bukan 180px: pada kartu selebar 600px hasilnya tetap
                // 180px seperti sebelumnya, tetapi pada layar 320px kolom label ikut
                // menyusut alih-alih menyisakan 100px untuk nilainya.
                width: "30%",
                padding: "9px 14px",
                fontSize: "12px",
                color: COLORS.muted,
                verticalAlign: "top",
                borderTop: index === 0 ? "none" : `1px solid ${COLORS.border}`,
              }}
            >
              {label}
            </td>
            <td
              style={{
                padding: "9px 14px",
                fontSize: "13px",
                color: COLORS.ink,
                verticalAlign: "top",
                // Katup pengaman, bukan gaya: nomor klaim seperti NID/CC/26/99/0001
                // tidak punya satu pun titik putus, dan pada layar 320px ia sendirian
                // memaksa kartu melebihi layar. Pada kartu 600px aturan ini tidak
                // pernah aktif, jadi tampilan di desktop sama persis. `anywhere`,
                // bukan `break-word`: hanya `anywhere` yang ikut memperkecil lebar
                // minimum tabel — `break-word` membungkus teks tetapi membiarkan
                // kolomnya tetap selebar kata terpanjang.
                overflowWrap: "anywhere",
                borderTop: index === 0 ? "none" : `1px solid ${COLORS.border}`,
              }}
            >
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ActionButton({ href, label }: { href: string; label: string }) {
  return (
    <table cellPadding={0} cellSpacing={0} role="presentation" style={{ margin: "0 0 8px" }}>
      <tbody>
        <tr>
          <td style={{ backgroundColor: COLORS.orangeDark, borderRadius: "8px" }}>
            <a
              href={href}
              style={{
                display: "inline-block",
                // 14px + 20px + 14px = 48px. Sebelumnya 39px — di bawah 44px yang
                // disarankan untuk sasaran sentuh, dan tombol inilah satu-satunya
                // jalan dari email kembali ke portal.
                padding: "14px 24px",
                lineHeight: "20px",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              {label}
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function AttachmentNote({ names }: { names: readonly string[] }) {
  if (names.length === 0) return null;

  return (
    <p style={{ margin: "14px 0 0", fontSize: "12px", color: COLORS.muted }}>
      Lampiran: {names.join(", ")}
    </p>
  );
}
