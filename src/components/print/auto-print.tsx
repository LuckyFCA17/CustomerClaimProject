"use client";

import { useEffect } from "react";

/**
 * Membuka dialog cetak peramban sendiri bila halaman dibuka dengan `?autoprint=1`.
 *
 * Dipakai tombol Print di halaman klaim: satu ketukan membuka tab baru yang langsung
 * menampilkan dialog cetak, bukan halaman yang masih harus dicari menu cetaknya — di
 * peramban ponsel menu itu tersembunyi dua lapis di dalam ⋮.
 *
 * Parameternya dibaca dari `window.location`, bukan `useSearchParams()`, supaya komponen
 * ini tidak memaksa seluruh halaman cetak menjadi dinamis dan tidak perlu dibungkus
 * Suspense. Tanpa parameter itu komponen ini tidak melakukan apa pun — termasuk saat
 * Puppeteer merender halaman yang sama untuk membuat PDF, yang tidak pernah
 * mengirimkannya.
 */
export function AutoPrint() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("autoprint") !== "1") return;

    let cancelled = false;

    // Menunggu font dan gambar selesai dimuat. Mencetak lebih awal menghasilkan lembar
    // dengan font pengganti dan kotak foto yang masih kosong — dan dialog cetak sudah
    // telanjur merekam halaman dalam keadaan itu.
    const ready = Promise.all([
      document.fonts.ready,
      ...Array.from(document.images)
        .filter((image) => !image.complete)
        .map(
          (image) =>
            new Promise<void>((resolve) => {
              image.addEventListener("load", () => resolve(), { once: true });
              image.addEventListener("error", () => resolve(), { once: true });
            }),
        ),
    ]);

    void ready.then(() => {
      if (!cancelled) window.print();
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
