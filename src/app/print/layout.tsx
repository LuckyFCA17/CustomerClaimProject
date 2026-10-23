/**
 * Kerangka halaman cetak (§9).
 *
 * Berada di luar grup (portal) sehingga tidak memakai sidebar maupun topbar: yang dibuka
 * Puppeteer harus persis selembar A4, tanpa kromium aplikasi di sekelilingnya.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="print-root">{children}</div>;
}
