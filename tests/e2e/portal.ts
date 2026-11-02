import path from "node:path";

import { expect, type Page } from "@playwright/test";

/**
 * Peralatan bersama pengujian E2E.
 *
 * Yang dikumpulkan di sini hanyalah hal yang berulang di setiap berkas uji — masuk,
 * berpindah pengguna, dan menekan tombol aksi. Selebihnya sengaja ditulis apa adanya di
 * dalam masing-masing uji, supaya alur yang sedang diuji terbaca sebagai cerita, bukan
 * sebagai rangkaian pemanggilan helper yang menyembunyikan apa yang sebenarnya terjadi.
 */

export const PASSWORD = "Nifco#2026";

export const USERS = {
  qaStaff: "dimas.prayoga@nifco.co.id",
  qaHead: "rina.kusuma@nifco.co.id",
  prodHead: "bambang.setiawan@nifco.co.id",
  factoryManager: "toshiro.tanaka@nifco.co.id",
  presDir: "kenji.yamamoto@nifco.co.id",
} as const;

export async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();

  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

export async function logout(page: Page): Promise<void> {
  // Sesi disimpan di cookie JWT; membuangnya lebih cepat dan lebih pasti daripada
  // mencari menu keluar, dan tidak ada yang diuji pada tombol itu di sini.
  await page.context().clearCookies();
}

export async function loginAs(page: Page, email: string): Promise<void> {
  await logout(page);
  await login(page, email);
}

/**
 * Menekan tombol aksi dan menunggu halaman benar-benar berpindah keadaan.
 *
 * Server action menulis lalu `router.refresh()`; tanpa menunggu jaringan tenang, asersi
 * berikutnya membaca layar yang masih menampilkan keadaan sebelumnya dan gagal secara
 * acak — kegagalan yang hilang saat diperiksa ulang, yang paling mahal untuk dikejar.
 */
export async function act(page: Page, name: RegExp | string): Promise<void> {
  await page.getByRole("button", { name }).first().click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);
}

/** Memastikan badge status klaim menampilkan status yang diharapkan. */
export async function expectStatus(page: Page, label: string | RegExp): Promise<void> {
  await expect(page.locator("body")).toContainText(label, { timeout: 20_000 });
}

// Playwright mentranspilasi berkas uji ke CommonJS, jadi `import.meta` tidak tersedia.
// Jalur dihitung dari akar proyek, tempat Playwright selalu dijalankan.
export const PHOTO = path.resolve("tests/e2e/fixtures/part.jpg");

/**
 * Mengisi seluruh medan wajib Bad News Information Form.
 *
 * Medan dipilih lewat atribut `name`, bukan lewat label. Tiga panel pada form ini memakai
 * label yang sama persis ("Part Name", "Qty"), jadi pencarian berdasarkan label akan
 * mengenai panel yang salah begitu urutannya berubah — kegagalan yang terbaca seperti bug
 * produk padahal ujinya yang salah sasaran.
 */
export async function fillClaimForm(page: Page, partName: string): Promise<void> {
  const form = page.locator("form").filter({ has: page.locator('[name="qualityProblem"]') });

  // Foto diunggah lebih dulu, bukan terakhir. Tiap unggahan memanggil `router.refresh()`,
  // dan refresh itu merender ulang form dari server — menghapus seluruh isian yang sudah
  // diketik tetapi belum tersimpan. Diurutkan terbalik, submit-nya gagal diam-diam dengan
  // form yang tampak terisi di layar sesaat sebelumnya.
  const uploads = form.locator('input[type="file"]');

  for (let index = 0; index < (await uploads.count()); index += 1) {
    await uploads.nth(index).setInputFiles(PHOTO);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);
  }

  // Toast "Foto terunggah" menutupi tombol kirim di footer; ditunggu sampai hilang.
  await page.waitForTimeout(2500);

  // Radio pada form ini digambar Radix: `<input name=...>`-nya aria-hidden dan label yang
  // menangkap klik, jadi `.check()` atas input itu selalu tertahan. Dipilih lewat peran
  // aksesibilitas — yang juga memastikan pilihannya benar-benar terbaca pembaca layar.
  await form.getByRole("radio", { name: /^Official/ }).click();

  await form.locator('input[name="dateOfOccurrence"]').fill("2026-10-26");
  await form.locator('select[name="shiftOfOccurrence"]').selectOption({ index: 1 });
  await form.locator('input[name="dateOfReceived"]').fill("2026-10-28");
  await form.locator('select[name="shiftOfReceived"]').selectOption({ index: 1 });

  await form.locator('input[name="failurePlace"]').fill("Line assembly 3");
  await form.locator('select[name="failurePlaceType"]').selectOption({ index: 1 });
  await form.locator('select[name="problemOrigin"]').selectOption({ index: 1 });
  await form.locator('select[name="customerId"]').selectOption({ index: 1 });

  await form.locator('input[name="contactPerson"]').fill("Budi Hartono");
  await form.locator('input[name="contactEmail"]').fill("budi.hartono@denso.co.id");
  await form.locator('input[name="contactPhone"]').fill("021-5551234");

  await form.locator('input[name="partName"]').first().fill(partName);
  await form.locator('input[name="internalPartNo"]').fill("NID-9001-01");
  await form.locator('input[name="customerPartNo"]').fill("90467-E2E01");

  for (const option of ["Critical Part", "First Time", "NID", "Crack / Broken"]) {
    await form.getByRole("radio", { name: option, exact: true }).click();
  }

  await form.locator('input[name="abnormalSource"]').fill("Laporan QC pelanggan");
  await form.locator('input[name="suspectedProcessLine"]').fill("Injection line 2");
  await form.locator('input[name="lotNo"]').fill("LOT-E2E-0001");
  await form.locator('input[name="kanbanNo"]').fill("KB-E2E-0001");
  await form
    .locator('textarea[name="qualityProblem"]')
    .fill("Kaki pengunci patah saat pemasangan; ditemukan 7 pcs dari 1.200 pcs kiriman.");

  for (const side of ["standard", "actual"] as const) {
    await form.locator(`input[name="${side}.partName"]`).fill(partName);
    await form.locator(`input[name="${side}.nidPartNo"]`).fill("NID-9001-01");
    await form.locator(`input[name="${side}.qty"]`).fill("7");
  }

}
