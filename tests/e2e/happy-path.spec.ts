import { expect, test } from "@playwright/test";

import { act, fillClaimForm, login, loginAs, USERS } from "./portal";

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
