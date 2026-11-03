import { expect, test } from "@playwright/test";

import { act, fillClaimForm, fillCparSections, login, loginAs, USERS } from "./portal";

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
    "Isi section",
  ]) {
    await expect(page.getByRole("button", { name: opener, exact: true })).toHaveCount(0);
  }

  await expect(page.locator("body")).toContainText(/CPAR in progress/i);
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
  await page.locator("#monitoring-note").fill("Dua periode mingguan setelah countermeasure.");

  await act(page, /Start CAPA monitoring/i);

  await expect(page.locator("body")).toContainText(/CAPA monitoring/i);
  await expect(page.locator("body")).toContainText(/Periode 1/i);
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
  await act(page, /Start CAPA monitoring/i);

  await expect(page.locator("body")).toContainText(/Periode 1/i);
});

test("seluruh periode efektif, klaim ditutup Verified Closed", async ({ page }) => {
  const id = claimUrl.split("/").pop();

  await loginAs(page, USERS.qaHead);
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
});
