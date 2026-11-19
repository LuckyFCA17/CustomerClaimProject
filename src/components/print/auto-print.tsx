"use client";

import { useEffect } from "react";

import { fitMarkedSheets } from "@/lib/sheet-fit";

/**
 * Menyiapkan halaman cetak: menyesuaikan lembar agar muat satu halaman, lalu — bila
 * diminta — membuka dialog cetak peramban.
 *
 * Keduanya satu komponen karena urutannya menentukan hasil. Dialog cetak merekam halaman
 * pada keadaan saat ia dibuka; dibuka sebelum lembarnya disesuaikan, yang tercetak adalah
 * lembar yang belum disesuaikan — persis bug yang membuat CPAR keluar dua halaman.
 *
 * Penyesuaian berjalan pada setiap pembukaan halaman, bukan hanya saat autoprint: dengan
 * begitu pratinjau `?preview=1`, dialog cetak, dan PDF yang dirender Puppeteer melihat
 * lembar yang sama. Lembar yang tidak menandai dirinya wajib satu halaman tidak disentuh.
 *
 * Parameternya dibaca dari `window.location`, bukan `useSearchParams()`, supaya komponen
 * ini tidak memaksa seluruh halaman cetak menjadi dinamis dan tidak perlu dibungkus
 * Suspense.
 */
export function AutoPrint() {
  useEffect(() => {
    let cancelled = false;

    // Menunggu font dan gambar selesai dimuat. Mengukur lebih awal menghasilkan tinggi
    // yang dihitung dengan font pengganti dan kotak foto yang masih kosong, dan hasil
    // pengukurannya meleset begitu yang asli datang.
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

    void ready
      .then(() => (cancelled ? [] : fitMarkedSheets()))
      .then(() => {
        if (cancelled) return;
        if (new URLSearchParams(window.location.search).get("autoprint") !== "1") return;

        window.print();
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
