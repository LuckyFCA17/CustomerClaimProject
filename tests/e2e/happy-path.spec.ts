import { expect, test } from "@playwright/test";

import {
  PHOTO,
  act,
  expectStatus,
  fillClaimForm,
  fillCparSections,
  login,
  loginAs,
  USERS,
} from "./portal";

/**
 * Happy path penuh (§7 Fase 8): satu klaim dari draft kosong sampai Verified Closed.
 *
 * Sengaja satu berkas uji dengan langkah berurutan, bukan beberapa uji yang masing-masing
 * menyiapkan datanya sendiri. Yang diuji di sini adalah **rantai**-nya: bahwa status yang
 * ditinggalkan satu tahap benar-benar diterima tahap berikutnya, lengkap dengan nomor
 * klaim, nomor CPAR, dan siklus yang ikut terbawa. Uji yang dipotong-potong akan
 * melewatkan justru sambungan antar tahap itu.
 */

test.describe.configure({ mode: "serial" });

const PART = "Clip Fastener E2E";

let claimUrl = "";

test("QA Staff membuat klaim dan mengirimnya untuk review", async ({ page }) => {
  await login(page, USERS.qaStaff);

  await page.goto("/claims");
  await page.getByRole("button", { name: /Issue new claim/i }).click();
  await page.waitForURL(/\/claims\/[^/]+\/edit/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");

  claimUrl = page.url().replace(/\/edit$/, "");

  await fillClaimForm(page, PART);
  await act(page, /Submit claim information/i);

  await expect(page.locator("body")).toContainText(/Pending QA Head review/i);
});

test("QA Dept. Head menyetujui, klaim terbit dengan nomor", async ({ page }) => {
  await loginAs(page, USERS.qaHead);

  await page.goto(`${claimUrl}/review`);
  await page.waitForLoadState("networkidle");

  await act(page, /Approve claim/i);

  await page.goto(claimUrl);
  await expect(page.locator("body")).toContainText(/Published/i);
  // Nomor klaim baru terbit pada persetujuan, bukan saat draft dibuat.
  await expect(page.locator("body")).toContainText(/NID\/CC\/\d{2}\/\d{2}\/\d{4}/);
});

test("QA Dept. Head menerbitkan CPAR ke departemen penanggung jawab", async ({ page }) => {
  await loginAs(page, USERS.qaHead);

  await page.goto(`${claimUrl}/follow-up`);
  await page.waitForLoadState("networkidle");

  await page.getByRole("radio", { name: /User Department/ }).first().click();
  await page.locator("#responsibleDeptId").selectOption({ label: "PRD — Production" });

  // Kapasitas User Dept. Head ditunjuk, bukan disimpulkan dari role: tanpa penunjukan
  // CPAR terbit dengan rantai verifikasi yang tidak pernah dapat dilengkapi.
  await page
    .locator("#userHeadVerifierId")
    .selectOption({ label: "Bambang Setiawan — Production Dept. Head" });

  // Minimal satu dokumen awal wajib diminta; tanpa itu form menolak dengan
  // "Pilih minimal satu dokumen yang diminta."
  await page.getByRole("checkbox", { name: "4M Change Sheet" }).click();
  await page.getByRole("checkbox", { name: "Inspection Standard" }).click();

  await page.locator("#dueDate").fill("2026-11-20");
  await page.locator("#note").fill("Mohon ditangani sebelum tenggat.");

  await act(page, /Submit problem countermeasure request/i);

  await page.goto(`/cpar/${claimUrl.split("/").pop()}`);
  await page.waitForLoadState("networkidle");

  await expect(page.locator("body")).toContainText(/NID\/CPAR\/\d{2}\/\d{4}/);
  await expect(page.locator("body")).toContainText(/Production/);
});

test("Production Dept. Head mengisi seluruh section CPAR", async ({ page }) => {
  await loginAs(page, USERS.prodHead);

  const cparUrl = `/cpar/${claimUrl.split("/").pop()}`;

  await fillCparSections(page, cparUrl);

  await page.goto(cparUrl);
  await page.waitForLoadState("networkidle");

  // Seluruh tombol pembuka harus hilang. Memeriksa satu section saja membuat uji ini
  // lolos sementara tiga section lain masih kosong — persis yang sempat terjadi.
  for (const opener of [
    "Isi tindakan penahan",
    "Gambar alur proses",
    "Mulai analisis 4M1E",
    "Isi perbaikan tetap",
    "Isi standardisasi & penyebaran",
  ]) {
    await expect(page.getByRole("button", { name: opener, exact: true })).toHaveCount(0);
  }

  await expect(page.locator("body")).toContainText(/CPAR in progress/i);
});

test("CPAR ditolak selama evidence belum dilampirkan", async ({ page }) => {
  await loginAs(page, USERS.qaHead);

  await page.goto(`/cpar/${claimUrl.split("/").pop()}`);
  await page.waitForLoadState("networkidle");

  // Seluruh section sudah terisi pada uji sebelumnya, dan belum satu pun evidence
  // diunggah — justru keadaan yang dijaga aturan ini. Tanpa uji di titik ini, gerbangnya
  // hanya terbukti lewat unit test dan tidak pernah lewat alur yang sebenarnya.
  await act(page, /Submit CPAR final report/i);

  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toContainText("Initial Document Request");
  await expect(dialog).toContainText("Permanent countermeasure");

  // Yang penting bukan hanya pop-upnya muncul, melainkan klaimnya tidak berpindah.
  await expectStatus(page, /CPAR in progress/i);
});

test("evidence dilampirkan untuk dokumen awal dan tiap baris action plan", async ({ page }) => {
  await loginAs(page, USERS.prodHead);

  const cparUrl = `/cpar/${claimUrl.split("/").pop()}`;
  await page.goto(cparUrl);
  await page.waitForLoadState("networkidle");

  // Dua dokumen awal yang diminta saat follow up, plus satu baris pada masing-masing
  // action plan. Keempatnya memakai input yang menerima PDF; input foto part ada di
  // halaman klaim, bukan di sini.
  //
  // Input Other Supporting Evidence dikecualikan: ia menuntut nama lebih dulu, jadi
  // mengirim berkas ke sana tanpa nama hanya menghasilkan penolakan yang tidak diuji
  // apa pun di sini. Bagian itu punya ujinya sendiri di bawah.
  const uploads = page.locator('input[type="file"][accept*="pdf"]:not([data-evidence="other"])');
  const total = await uploads.count();

  expect(total).toBeGreaterThan(0);

  for (let index = 0; index < total; index += 1) {
    await uploads.nth(index).setInputFiles(PHOTO);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);
  }

  await page.goto(cparUrl);
  await page.waitForLoadState("networkidle");

  // Kartu submit menyebutkan sisa pekerjaannya; kosongnya kalimat itu adalah tanda
  // kedua syarat sudah terpenuhi.
  await expect(page.locator("body")).not.toContainText(/evidence belum dilampirkan/i);
});

test("Other Supporting Evidence menyimpan berkas dengan nama yang ditentukan", async ({
  page,
}) => {
  await loginAs(page, USERS.prodHead);

  const cparUrl = `/cpar/${claimUrl.split("/").pop()}`;
  await page.goto(cparUrl);
  await page.waitForLoadState("networkidle");

  const name = "Foto hasil sortir 100% di warehouse NID";

  await page.getByLabel("Nama berkas", { exact: true }).fill(name);
  await page.locator('input[type="file"][data-evidence="other"]').setInputFiles(PHOTO);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);

  await page.goto(cparUrl);
  await page.waitForLoadState("networkidle");

  // Yang tampil nama yang diketik, bukan nama berkas dari kamera — itulah seluruh gunanya
  // kolom nama. Nama aslinya tetap tercetak di bawahnya, jadi berkas yang diunduh masih
  // dapat dicocokkan dengan barisnya.
  await expect(page.locator("body")).toContainText(name);

  // Dan bagian ini tidak boleh menahan submit: berkas pendukung sifatnya "kalau ada".
  await expect(page.locator("body")).not.toContainText(/evidence belum dilampirkan/i);
});

test("QA Dept. Head mengirim CPAR ke rantai verifikasi", async ({ page }) => {
  await loginAs(page, USERS.qaHead);

  await page.goto(`/cpar/${claimUrl.split("/").pop()}`);
  await page.waitForLoadState("networkidle");

  await act(page, /Submit CPAR final report/i);

  // Pop-up "Submission incomplete" tidak boleh muncul: seluruh section wajib sudah
  // lengkap. Section yang tersimpan tetapi belum lengkap tidak terlihat dari tombolnya,
  // hanya dari penolakan ini — jadi inilah pemeriksaan kelengkapan yang sebenarnya.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("body")).toContainText(/CPAR under verification/i);
});

test("empat kapasitas verifier menyetujui CPAR", async ({ page }) => {
  const cparUrl = `/cpar/${claimUrl.split("/").pop()}`;

  // Urutannya tidak diatur portal — siapa pun boleh lebih dulu. Yang dijaga adalah
  // CPAR baru disetujui setelah keempatnya memutuskan, bukan setelah yang pertama.
  for (const verifier of [USERS.qaHead, USERS.prodHead, USERS.factoryManager, USERS.presDir]) {
    await loginAs(page, verifier);
    await page.goto(cparUrl);
    await page.waitForLoadState("networkidle");

    await act(page, /^Verified$/);
  }

  await page.goto(cparUrl);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("body")).toContainText(/CPAR approved|CAPA monitoring/i);
});

test("QA memulai pemantauan CAPA", async ({ page }) => {
  await loginAs(page, USERS.qaHead);

  // Jadwal pemantauan dibuka dari halaman Monitoring, bukan dari halaman CPAR.
  await page.goto(`/monitoring/${claimUrl.split("/").pop()}`);
  await page.waitForLoadState("networkidle");

  await page.locator("#period-count").fill("2");
  await page.locator("#interval-days").fill("5");
  await page.locator("#check-item-0").fill("Hasil inspeksi 100% kaki pengunci pada 500 pcs pertama");
  await page.getByRole("button", { name: "Tambah item", exact: true }).click();
  await page.waitForTimeout(400);
  await page.locator("#check-item-1").fill("Catatan tekanan holding mesin 4 tiap shift");
  await page.locator("#monitoring-note").fill("Dua periode mingguan setelah countermeasure.");

  await act(page, /Start CAPA monitoring/i);

  await expect(page.locator("body")).toContainText(/CAPA monitoring/i);
  await expect(page.locator("body")).toContainText(/Periode 1/i);

  // Item yang ditetapkan tadi harus muncul di tiap periode, bukan hanya di periode 1.
  await expect(page.getByText("Catatan tekanan holding mesin 4 tiap shift")).toHaveCount(2);
});

test("angka produksi dan inspeksi dicatat per tanggal, lalu direkap", async ({ page }) => {
  await loginAs(page, USERS.prodHead);

  await page.goto(`/monitoring/${claimUrl.split("/").pop()}`);
  await page.waitForLoadState("networkidle");

  // Dua baris pada periode 1: satu produksi, satu inspeksi, pada tanggal yang sama —
  // keduanya harus mendarat di satu baris rekap, bukan dua.
  const production = page.locator('[data-results="PRODUCTION"]').first();
  await production.getByLabel("Tanggal produksi").fill("2026-11-16");
  await production.getByLabel("Jumlah produksi").fill("500");
  await production.getByLabel("Total OK").fill("498");
  await production.getByLabel("Total NG").fill("2");
  await production.getByRole("button", { name: "Tambah baris" }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);

  const inspection = page.locator('[data-results="INSPECTION"]').first();
  await inspection.getByLabel("Tanggal inspeksi").fill("2026-11-16");
  await inspection.getByLabel("Jumlah diperiksa").fill("120");
  await inspection.getByLabel("Total OK").fill("120");
  await inspection.getByLabel("Total NG").fill("0");
  await inspection.getByRole("button", { name: "Tambah baris" }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);

  await page.goto(`/monitoring/${claimUrl.split("/").pop()}`);
  await page.waitForLoadState("networkidle");

  await expect(page.locator("body")).toContainText("Rekap hasil produksi & inspeksi");
  await expect(page.locator("body")).toContainText("Bagian NG per tanggal");

  // 2 NG dari 500 yang dinilai = 0,40%.
  await expect(page.locator("body")).toContainText("0.40%");
});

test("OK + NG yang tidak sama dengan jumlahnya ditolak, ke dua arah", async ({ page }) => {
  await loginAs(page, USERS.prodHead);

  await page.goto(`/monitoring/${claimUrl.split("/").pop()}`);
  await page.waitForLoadState("networkidle");

  const production = page.locator('[data-results="PRODUCTION"]').first();

  async function coba(quantity: string, okCount: string, ngCount: string) {
    await production.getByLabel("Tanggal produksi").fill("2026-11-17");
    await production.getByLabel("Jumlah produksi").fill(quantity);
    await production.getByLabel("Total OK").fill(okCount);
    await production.getByLabel("Total NG").fill(ngCount);
    await production.getByRole("button", { name: "Tambah baris" }).click();
    await page.waitForTimeout(1200);
  }

  await coba("100", "99", "5");
  await expect(page.locator("body")).toContainText(/melebihi jumlahnya/i);

  // Arah yang dulu lolos tanpa suara: 5.000 diproduksi, OK 2.000, NG 100.
  await coba("5000", "2000", "100");
  await expect(page.locator("body")).toContainText(/kurang dari jumlahnya/i);

  // Menyunting salah satu angka membersihkan pesan server, dan petunjuk langsung yang
  // mengambil alih — keduanya tidak pernah tampil bersamaan. Nilainya harus benar-benar
  // berubah: mengisi ulang angka yang sama tidak memicu onChange, jadi tidak ada yang
  // dibersihkan dan uji ini akan gagal karena alasan yang tidak ada hubungannya.
  await production.getByLabel("Total OK").fill("2500");
  await expect(production).not.toContainText(/kurang dari jumlahnya/i);
  await expect(production).toContainText(/kurang 2\.400 dari 5\.000/i);

  // Angka yang pas membuat petunjuknya berbalik, tanpa perlu menekan apa pun.
  await production.getByLabel("Total OK").fill("4900");
  await expect(production).toContainText(/cocok dengan jumlahnya/i);

  // Dan tidak ada baris yang tersimpan dari kedua percobaan yang ditolak tadi.
  await expect(production).not.toContainText("17 Nov 2026");
});

test("periode dapat ditutup dan dibuka lagi", async ({ page }) => {
  await loginAs(page, USERS.prodHead);

  await page.goto(`/monitoring/${claimUrl.split("/").pop()}`);
  await page.waitForLoadState("networkidle");

  const period = page.locator("details").filter({ hasText: "Periode 1" }).first();
  const summary = period.locator("summary").first();

  // Periode yang masih menunggu penilaian terbuka sejak awal.
  await expect(period).toHaveAttribute("open", "");
  await expect(period.getByText("Monitoring hasil produksi")).toBeVisible();

  await summary.click();
  await page.waitForTimeout(400);

  await expect(period).not.toHaveAttribute("open", "");
  await expect(period.getByText("Monitoring hasil produksi")).toBeHidden();

  // Yang tersisa saat tertutup bukan hanya judulnya: keadaannya ikut terbaca.
  await expect(summary).toContainText(/item berbukti/);

  await summary.click();
  await page.waitForTimeout(400);
  await expect(period.getByText("Monitoring hasil produksi")).toBeVisible();
});

test("Effective ditolak selama item check belum ada buktinya", async ({ page }) => {
  await loginAs(page, USERS.qaHead);

  await page.goto(`/monitoring/${claimUrl.split("/").pop()}`);
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Effective", exact: true }).first().click();
  await page.waitForTimeout(1200);

  await expect(page.locator("body")).toContainText(/Belum ada bukti untuk/i);
});

test("periode dinilai Not Effective: klaim kembali ke CPAR revision, siklus naik", async ({
  page,
}) => {
  await loginAs(page, USERS.qaHead);

  await page.goto(`/monitoring/${claimUrl.split("/").pop()}`);
  await page.waitForLoadState("networkidle");

  // Tombol "Not Effective" hanya membuka kolom catatan; pengirimannya tombol kedua.
  await page.getByRole("button", { name: "Not Effective", exact: true }).first().click();
  await page.waitForTimeout(600);

  await page
    .getByLabel(/Apa yang belum berhasil/)
    .first()
    .fill("Keluhan serupa muncul lagi pada lot berikutnya; alarm tekanan belum terpasang.");

  await act(page, /Kirim penilaian Not Effective/i);

  await page.goto(claimUrl);
  await page.waitForLoadState("networkidle");

  await expect(page.locator("body")).toContainText(/CPAR revision/i);
  await expect(page.locator("body")).toContainText(/Siklus 2/i);
});

test("siklus 2 dikirim ulang, diverifikasi ulang, dan pemantauan dibuka lagi", async ({ page }) => {
  const id = claimUrl.split("/").pop();

  await loginAs(page, USERS.qaHead);
  await page.goto(`/cpar/${id}`);
  await page.waitForLoadState("networkidle");

  // Section tetap terisi dari siklus 1; yang diulang adalah rantai verifikasinya.
  await act(page, /Submit CPAR final report/i);
  await expect(page.locator("body")).toContainText(/CPAR under verification/i);

  for (const verifier of [USERS.qaHead, USERS.prodHead, USERS.factoryManager, USERS.presDir]) {
    await loginAs(page, verifier);
    await page.goto(`/cpar/${id}`);
    await page.waitForLoadState("networkidle");
    await act(page, /^Verified$/);
  }

  await loginAs(page, USERS.qaHead);
  await page.goto(`/monitoring/${id}`);
  await page.waitForLoadState("networkidle");

  await page.locator("#period-count").fill("2");
  await page.locator("#interval-days").fill("5");
  await page.locator("#check-item-0").fill("Hasil inspeksi 100% setelah alarm tekanan terpasang");
  await act(page, /Start CAPA monitoring/i);

  await expect(page.locator("body")).toContainText(/Periode 1/i);
});

test("seluruh periode efektif, klaim ditutup Verified Closed", async ({ page }) => {
  const id = claimUrl.split("/").pop();

  await loginAs(page, USERS.qaHead);
  await page.goto(`/monitoring/${id}`);
  await page.waitForLoadState("networkidle");

  // Tiap item check harus punya bukti sebelum periode boleh dinyatakan Effective —
  // itulah gerbang yang dipasang saat item ditetapkan di muka.
  const uploads = page.locator('input[type="file"][data-evidence="check"]');
  const total = await uploads.count();

  expect(total).toBeGreaterThan(0);

  for (let index = 0; index < total; index += 1) {
    await uploads.nth(index).setInputFiles(PHOTO);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);
  }

  await page.goto(`/monitoring/${id}`);
  await page.waitForLoadState("networkidle");

  // Dinilai satu per satu; tiap penilaian menulis ulang halaman.
  for (let round = 0; round < 2; round += 1) {
    const effective = page.getByRole("button", { name: "Effective", exact: true });

    if ((await effective.count()) === 0) break;

    await effective.first().click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);
  }

  await page.locator("#report-summary").fill(
    "Dua periode pemantauan tidak menemukan temuan berulang setelah alarm tekanan " +
      "terpasang dan jadwal perawatan regulator diterapkan.",
  );
  await page.locator("#report-lesson").fill("Komponen kritis harus masuk jadwal perawatan sejak awal.");

  await act(page, /Submit improvement monitoring report/i);

  await page.goto(claimUrl);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("body")).toContainText(/Verified closed/i);

  // Di dasbor CPAR, status akhir dipecah menurut ketepatan waktunya. Yang diuji adalah
  // badge-nya memang salah satu dari keduanya, bukan yang mana — tenggat pada fikstur
  // ini tanggal tetap, jadi menguncinya ke satu label akan membuat uji ini berubah
  // hasil sendiri begitu tanggal itu terlewat di dunia nyata.
  await page.goto("/cpar");
  await page.waitForLoadState("networkidle");

  const row = page.locator("li").filter({ hasText: /NID\/CPAR\// }).first();

  await expect(row).toContainText(/Closed (under due date|overdue date)/);
  await expect(row).not.toContainText(/Verified closed/);

  // Lembar cetak memuat dua blok persetujuan: empat kapasitas internal yang sudah
  // tercatat portal, dan tiga kolom kosong untuk diparaf pihak pelanggan.
  await page.goto(`/print/cpar/${id}`);
  await page.waitForLoadState("networkidle");

  const sheet = page.locator(".sheet");

  await expect(sheet).toContainText("Customer approval");
  for (const role of ["Received by", "Checked by", "Approved by"]) {
    await expect(sheet).toContainText(role);
  }
});
