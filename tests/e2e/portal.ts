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

/** Menyimpan satu section CPAR dan menunggu halaman menulis ulang keadaannya. */
async function saveSection(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Save update", exact: true }).first().click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);
}

/**
 * Mengisi satu analisis 4M1E — dipakai dua kali, untuk occurrence dan outflow.
 *
 * Editor yang terbuka dikenali dari id medannya, bukan dari urutan tombol. Kedua tombol
 * pembukanya bernama sama persis ("Mulai analisis 4M1E"), dan begitu yang pertama diisi,
 * urutan tombol yang tersisa bergeser — memilih berdasarkan indeks akan mengisi section
 * yang sama dua kali tanpa ada yang terlihat salah.
 */
async function fillRootCause(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Mulai analisis 4M1E", exact: true }).first().click();
  await page.waitForTimeout(900);

  const key = (await page.locator("#ROOT_CAUSE_OCCURRENCE-problem").count())
    ? "ROOT_CAUSE_OCCURRENCE"
    : "ROOT_CAUSE_OUTFLOW";

  const occurrence = key === "ROOT_CAUSE_OCCURRENCE";

  await page
    .locator(`#${key}-problem`)
    .fill(occurrence ? "Kaki pengunci patah saat perakitan" : "Part cacat lolos ke pelanggan");

  await page.getByRole("button", { name: occurrence ? "Machine" : "Method", exact: true }).click();
  await page.waitForTimeout(700);

  await page.getByLabel("Item yang diperiksa").fill(occurrence ? "Tekanan injeksi" : "Inspeksi akhir");
  await page.getByLabel("Control point (standar acuan)").fill(occurrence ? "45 ± 2 MPa" : "100% visual");
  await page.getByLabel("Kondisi aktual").fill(occurrence ? "Terukur 38 MPa" : "Sampling 10%");
  await page.getByLabel("Judgement").selectOption("NG");

  // Tidak ada tombol yang perlu ditekan: rantai 5 Why terbuka sendiri begitu judgement
  // bernilai NG, dan tombol "Telusuri 5 Why" justru menghilang saat itu.
  await page.waitForTimeout(700);

  // Lima tingkat; yang terdalam adalah akarnya.
  const whys = occurrence
    ? [
        "Tekanan injeksi di bawah standar",
        "Katup regulator aus",
        "Tidak masuk jadwal perawatan",
        "Daftar komponen kritis belum memuat regulator",
        "Standar perawatan tidak ditinjau sejak 2024",
      ]
    : [
        "Inspeksi akhir hanya sampling",
        "Standar inspeksi menetapkan sampling",
        "Part belum diklasifikasikan kritis",
        "Klasifikasi mengikuti dokumen lama",
        "Tidak ada tinjauan klasifikasi part",
      ];

  // Baris berikutnya baru muncul setelah baris sebelumnya terisi, jadi jumlahnya
  // dihitung ulang tiap langkah alih-alih sekali di awal.
  for (let level = 0; level < whys.length; level += 1) {
    const field = page.getByLabel(new RegExp(`^Why ${level + 1} untuk faktor`));

    if ((await field.count()) === 0) break;

    await field.first().fill(whys[level]);
    await page.waitForTimeout(250);
  }

  await page
    .locator(`#${key}-conclusion`)
    .fill(whys[whys.length - 1]);

  await saveSection(page);

  return key;
}

/**
 * Mengisi satu baris rencana tindakan: isi tindakan, PIC yang diminta, dan tanggalnya.
 *
 * Ketiganya wajib. Menambahkan baris lalu menyimpannya tanpa diisi membuat section
 * terbaca "tersimpan" padahal kosong — dan itu yang membuat asersi longgar lolos sementara
 * CPAR-nya sebenarnya belum lengkap.
 */
async function fillActionRow(
  page: Page,
  itemLabel: string,
  action: string,
  implementedOn: string,
): Promise<void> {
  await page.getByLabel(itemLabel, { exact: true }).fill(action);
  await page.getByLabel("PIC yang diminta").last().selectOption({ index: 1 });
  await page.getByLabel("Tanggal implementasi").last().fill(implementedOn);
}

/**
 * Mengisi seluruh section CPAR sampai siap dikirim ke rantai verifikasi.
 *
 * Isinya sengaja masuk akal, bukan "aaa": lembar CPAR ikut tercetak ke PDF dan terbaca
 * pada email, dan uji yang meninggalkan omong kosong di sana menyembunyikan tata letak
 * yang rusak justru pada data yang panjangnya wajar.
 */
export async function fillCparSections(page: Page, cparUrl: string): Promise<void> {
  const open = async (name: string) => {
    await page.goto(cparUrl);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    await page.getByRole("button", { name, exact: true }).first().click();
    await page.waitForTimeout(900);
  };

  await open("Isi tindakan penahan");
  await page.getByRole("button", { name: "Selection stock internal", exact: true }).click();
  await page.locator("#ta-note").fill("Seluruh stok internal disortir 100%; 12 pcs NG ditahan.");
  await saveSection(page);

  await open("Gambar alur proses");
  await page.getByRole("button", { name: "Pakai alur umum NID", exact: true }).click();
  await page.waitForTimeout(700);
  await page.locator("#flow-note").fill("Alur standar NID; titik deteksi ada pada inspeksi akhir.");
  await saveSection(page);

  await page.goto(cparUrl);
  await page.waitForLoadState("networkidle");
  await fillRootCause(page);

  await page.goto(cparUrl);
  await page.waitForLoadState("networkidle");
  await fillRootCause(page);

  await open("Isi perbaikan tetap");
  await page.getByRole("button", { name: "Tambah tindakan", exact: true }).click();
  await page.waitForTimeout(700);
  await fillActionRow(
    page,
    "Tindakan perbaikan 1",
    "Mengganti seal regulator mesin 4 dan memasukkannya ke jadwal perawatan jam operasi",
    "2026-11-18",
  );
  await saveSection(page);

  await open("Isi standardisasi & penyebaran");
  await page.getByRole("button", { name: "Tambah baris", exact: true }).click();
  await page.waitForTimeout(700);
  await fillActionRow(
    page,
    "Dokumen atau penerapan 1",
    "WI-PRD-014 direvisi ke rev. 3 dan jadwal perawatan diterapkan ke mesin 1–3",
    "2026-11-19",
  );
  await saveSection(page);

  await open("Isi section");
  await page
    .locator("textarea")
    .last()
    .fill("Pemantauan tiga periode mingguan; efektif bila tidak ada temuan berulang.");
  await saveSection(page);
}
