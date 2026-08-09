import { describe, expect, it } from "vitest";

import { isNavItemActive, NAV_ITEMS, navItemsFor, ROLE_CODES, ROLE_LABEL } from "@/config/navigation";

describe("navigasi portal", () => {
  it("memberi label untuk tujuh role pada §3", () => {
    expect(ROLE_CODES).toHaveLength(7);
    for (const role of ROLE_CODES) {
      expect(ROLE_LABEL[role], role).toBeTruthy();
    }
  });

  it("menyembunyikan Master Data dari role selain ADMIN", () => {
    const qaMenu = navItemsFor(["QA"]).map((item) => item.href);
    expect(qaMenu).not.toContain("/master");

    const adminMenu = navItemsFor(["ADMIN"]).map((item) => item.href);
    expect(adminMenu).toContain("/master");
  });

  it("menampilkan log notifikasi hanya untuk QA_HEAD dan ADMIN", () => {
    expect(navItemsFor(["USER_DEPT"]).map((item) => item.href)).not.toContain("/notifications");
    expect(navItemsFor(["QA_HEAD"]).map((item) => item.href)).toContain("/notifications");
    expect(navItemsFor(["ADMIN"]).map((item) => item.href)).toContain("/notifications");
  });

  it("menggabungkan menu untuk user dengan lebih dari satu role (§3 rangkap jabatan)", () => {
    const combined = navItemsFor(["USER_DEPT", "ADMIN"]).map((item) => item.href);
    expect(combined).toContain("/master");
    expect(combined).toContain("/claims");
  });

  it("selalu menampilkan menu tanpa pembatasan role", () => {
    const openItems = NAV_ITEMS.filter((item) => !item.roles).map((item) => item.href);
    for (const role of ROLE_CODES) {
      const hrefs = navItemsFor([role]).map((item) => item.href);
      for (const href of openItems) {
        expect(hrefs, role).toContain(href);
      }
    }
  });

  it("menandai menu aktif untuk sub-route, bukan untuk prefix yang kebetulan mirip", () => {
    const claims = NAV_ITEMS.find((item) => item.href === "/claims");
    expect(claims).toBeDefined();
    if (!claims) return;

    expect(isNavItemActive(claims, "/claims")).toBe(true);
    expect(isNavItemActive(claims, "/claims/abc123/review")).toBe(true);
    expect(isNavItemActive(claims, "/claims-archive")).toBe(false);
    expect(isNavItemActive(claims, "/dashboard")).toBe(false);
  });
});
