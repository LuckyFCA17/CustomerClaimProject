/**
 * Penyesuaian lembar agar memenuhi satu halaman.
 *
 * Berjalan di peramban, pada halaman cetak itu sendiri — bukan di sisi server. Dulu
 * sebaliknya, dan itulah sebabnya CPAR tercetak dua halaman: `renderPdf` menyesuaikan
 * lembar sebelum mencetak, tetapi tombol **Print CPAR** di portal tidak lewat sana sama
 * sekali. Ia membuka dialog cetak peramban, yang mencetak halaman apa adanya. Hasilnya
 * dua jalur dengan dua hasil berbeda dari lembar yang sama, dan yang dipakai orang
 * sehari-hari justru jalur yang tidak disesuaikan.
 *
 * Sekarang halaman yang menyesuaikan dirinya sendiri, dan keduanya — dialog cetak
 * peramban maupun Puppeteer — menunggu hasil yang sama.
 */

/**
 * Batas bawah penyusutan.
 *
 * Di bawah ini huruf 7,5pt lembar A3 jatuh ke sekitar 5pt — muat satu halaman tetapi
 * tidak lagi terbaca dari jarak papan, yang justru alasan lembar ini dicetak A3.
 * Lebih baik dua halaman yang terbaca daripada satu halaman yang tidak.
 */
export const MIN_FIT = 0.65;

/**
 * Batas atas pembesaran.
 *
 * 1,45 membuat huruf 7,5pt menjadi sekitar 10,9pt — masih terbaca sebagai formulir, bukan
 * poster. Tanpa batas, CPAR yang hampir seluruh sectionnya berisi "—" akan dibesarkan
 * sampai hurufnya janggal, dan dua lembar yang ditempel berdampingan akan terlihat
 * berasal dari dokumen yang berbeda.
 */
export const MAX_FIT = 1.45;

/** Penanda pada `.sheet` bahwa lembar ini wajib muat satu halaman. */
export const ONE_PAGE_ATTR = "data-one-page";

/**
 * Penanda hasil, dibaca Puppeteer.
 *
 * Nilainya `pending` sampai pencarian selesai, lalu faktor yang dipakai sebagai angka.
 * Puppeteer menunggu atribut ini berubah alih-alih menjalankan pencariannya sendiri,
 * sehingga hanya ada satu implementasi yang bisa salah.
 */
export const FIT_ATTR = "data-fit";

export interface FitResult {
  readonly fit: number;
  readonly fits: boolean;
}

/**
 * Mencari faktor terbesar yang isinya masih muat satu halaman — mengecilkan maupun
 * membesarkan.
 *
 * Dua masalah yang ditangani fungsi yang sama, karena keduanya pertanyaan yang sama:
 *
 *   · CPAR yang penuh meluap ke halaman kedua. Tata letaknya sendiri sudah dipadatkan
 *     sampai muat dengan sisa sekitar 8mm, dan sisa setipis itu habis oleh satu action
 *     plan yang panjang;
 *   · CPAR yang isiannya sedikit berhenti di dua pertiga halaman dan menyisakan pita
 *     kosong di bawahnya. Lembarnya tetap selembar A3 yang ditempel di papan, jadi ruang
 *     yang tidak terpakai itu hanya membuat hurufnya lebih kecil daripada yang bisa.
 *
 * Dicari lewat bagi dua, bukan sekali hitung: `zoom` mengalirkan ulang teks, jadi tinggi
 * tidak berbanding lurus dengan faktornya. Percobaan pertama selalu pada 1, sehingga
 * pencariannya menuruni rentang bila lembarnya meluap dan menaikinya bila masih longgar —
 * tanpa cabang terpisah.
 */
export async function fitSheetToPage(sheet: HTMLElement): Promise<FitResult> {
  const content = sheet.querySelector<HTMLElement>(".sheet-fit");
  if (!content) return { fit: 1, fits: true };

  const style = getComputedStyle(sheet);

  // Tinggi satu halaman sama dengan min-height lembar, menurut konstruksinya — dibaca
  // dari sana supaya tetap benar bila ukuran kertasnya berubah.
  const pageHeight = Number.parseFloat(style.minHeight);
  if (!Number.isFinite(pageHeight) || pageHeight <= 0) return { fit: 1, fits: true };

  /**
   * Yang diukur isinya, bukan lembarnya.
   *
   * `.sheet` punya `min-height` satu halaman, jadi tingginya **tidak pernah** kurang
   * dari itu — isi sependek apa pun tetap terukur pas. Mengukurnya berarti ambang
   * "muat" tidak dapat diberi jarak aman sama sekali, dan lembar yang tingginya meleset
   * setengah piksel lolos pemeriksaan lalu tercetak dua halaman.
   */
  const available =
    pageHeight - Number.parseFloat(style.paddingTop) - Number.parseFloat(style.paddingBottom);

  // Dua piksel jarak aman: tata letak layar dan tata letak cetak membulatkan berbeda,
  // dan selisih sekecil itu cukup untuk menambah satu halaman kosong.
  const safety = 2;

  const settle = () => new Promise((resolve) => requestAnimationFrame(resolve));
  const tooTall = () => content.getBoundingClientRect().height > available - safety;

  let low = MIN_FIT;
  let high = MAX_FIT;
  let best = 0;
  let candidate = 1;

  // Satu percobaan di 1 plus delapan kali bagi dua mempersempit selisihnya ke bawah
  // 0,4% — jauh lebih halus daripada yang dapat dibedakan mata pada hasil cetak.
  for (let pass = 0; pass < 9; pass += 1) {
    sheet.style.setProperty("--fit", String(candidate));
    await settle();

    if (tooTall()) {
      high = candidate;
    } else {
      best = Math.max(best, candidate);
      low = candidate;
    }

    candidate = (low + high) / 2;
  }

  // Bahkan pada batas bawah keterbacaan isinya tidak muat. Lembar dibiarkan dua halaman:
  // memaksanya lebih kecil lagi menghasilkan satu halaman yang tidak dapat dibaca, dan
  // itu bukan perbaikan.
  if (best === 0) {
    sheet.style.setProperty("--fit", String(MIN_FIT));
    await settle();

    return { fit: MIN_FIT, fits: !tooTall() };
  }

  sheet.style.setProperty("--fit", String(best));
  await settle();

  return { fit: best, fits: true };
}

/**
 * Menyesuaikan setiap lembar yang menandai dirinya wajib satu halaman.
 *
 * Satu halaman cetak hanya pernah memuat satu lembar seperti itu, tetapi pengulangan di
 * sini membuat pemanggilnya tidak perlu tahu hal tersebut.
 */
export async function fitMarkedSheets(root: ParentNode = document): Promise<readonly FitResult[]> {
  const sheets = [...root.querySelectorAll<HTMLElement>(`.sheet[${ONE_PAGE_ATTR}="true"]`)];
  const results: FitResult[] = [];

  for (const sheet of sheets) {
    const result = await fitSheetToPage(sheet);
    sheet.setAttribute(FIT_ATTR, String(result.fit));
    results.push(result);
  }

  return results;
}
