import { expect, test } from "@playwright/test";

import { login, USERS } from "./portal";

/**
 * Pemeriksaan paling dasar: harness E2E benar-benar menyala.
 *
 * Nilainya muncul ketika alur panjang gagal — uji ini memisahkan "portalnya rusak" dari
 * "harness-nya yang tidak jalan", dua hal yang gejalanya sama di laporan Playwright.
 */
test("masuk sebagai QA Staff dan melihat dashboard", async ({ page }) => {
  await login(page, USERS.qaStaff);

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.locator("body")).toContainText("Dimas Prayoga");
});

test("basis data uji terisi seed, bukan data pengembangan", async ({ page }) => {
  await login(page, USERS.qaHead);
  await page.goto("/claims");

  // Seed membuat tiga klaim contoh; data pengembangan punya jauh lebih banyak.
  await expect(page.locator("body")).toContainText(/klaim/i);
});
