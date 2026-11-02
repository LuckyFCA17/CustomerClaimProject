import { describe, expect, it } from "vitest";

import { RoleCode } from "@/generated/prisma/enums";
import { CATALOGS, CATALOG_SLUGS, isCatalogSlug } from "@/lib/master-catalog";
import {
  PASSWORD_MIN,
  ROLE_CODES,
  catalogEntrySchema,
  createUserSchema,
  departmentSchema,
  hasAdminRole,
  updateUserSchema,
  wouldRemoveLastAdmin,
} from "@/schemas/master";

/**
 * Data acuan menentukan hak akses. Yang diuji di sini bukan kerapian isian, melainkan
 * dua hal yang akibatnya tidak dapat diperbaiki dari dalam portal: role yang salah, dan
 * hilangnya Administrator terakhir.
 */

function errorsFor(
  result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } },
  field: string,
) {
  if (result.success || !result.error) return [];

  return result.error.issues
    .filter((issue) => issue.path.map(String).join(".") === field)
    .map((issue) => issue.message);
}

describe("departmentSchema", () => {
  it("menormalkan kode menjadi huruf besar", () => {
    const result = departmentSchema.safeParse({ code: " prd ", name: "Production" });

    expect(result.success).toBe(true);
    expect(result.success ? result.data.code : null).toBe("PRD");
  });

  it("menolak kode yang mengandung spasi atau tanda baca lain", () => {
    expect(errorsFor(departmentSchema.safeParse({ code: "PR D", name: "X Y" }), "code"))
      .toHaveLength(1);
    expect(departmentSchema.safeParse({ code: "QA&E", name: "QA Engineering" }).success).toBe(true);
  });

  it("mewajibkan kode dan nama", () => {
    expect(errorsFor(departmentSchema.safeParse({ code: "P", name: "Production" }), "code"))
      .toHaveLength(1);
    expect(errorsFor(departmentSchema.safeParse({ code: "PRD", name: "P" }), "name"))
      .toHaveLength(1);
  });

  it("membolehkan alamat grup kosong, tetapi menolak yang tidak berbentuk email", () => {
    const empty = departmentSchema.safeParse({ code: "PRD", name: "Production", email: "" });

    expect(empty.success).toBe(true);
    expect(empty.success ? empty.data.email : null).toBe("");
    expect(
      departmentSchema.safeParse({ code: "PRD", name: "Production", email: "bukan-email" }).success,
    ).toBe(false);
  });

  it("menormalkan alamat grup menjadi huruf kecil", () => {
    const result = departmentSchema.safeParse({
      code: "PRD",
      name: "Production",
      email: "Production@Nifco.CO.ID",
    });

    expect(result.success ? result.data.email : null).toBe("production@nifco.co.id");
  });
});

describe("createUserSchema", () => {
  const base = {
    name: "Yusuf Ramadhan",
    email: "  Yusuf.Ramadhan@NIFCO.co.id ",
    jobTitle: "Production Supervisor",
    roles: ["USER_DEPT"],
    password: "kata-sandi-panjang",
  };

  it("menormalkan email menjadi huruf kecil tanpa spasi", () => {
    const result = createUserSchema.safeParse(base);

    expect(result.success).toBe(true);
    expect(result.success ? result.data.email : null).toBe("yusuf.ramadhan@nifco.co.id");
  });

  it("mewajibkan setidaknya satu role", () => {
    expect(errorsFor(createUserSchema.safeParse({ ...base, roles: [] }), "roles")).toHaveLength(1);
  });

  it("menolak role yang tidak dikenal", () => {
    expect(createUserSchema.safeParse({ ...base, roles: ["SUPERUSER"] }).success).toBe(false);
  });

  it("menuntut kata sandi yang cukup panjang", () => {
    expect(PASSWORD_MIN).toBeGreaterThanOrEqual(10);
    expect(createUserSchema.safeParse({ ...base, password: "pendek" }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...base, password: "a".repeat(PASSWORD_MIN) }).success)
      .toBe(true);
  });

  it("membolehkan pengguna tanpa departemen", () => {
    // Factory Manager dan President Director tidak bernaung di satu departemen.
    const result = createUserSchema.safeParse({ ...base, roles: ["PRESDIR"], departmentId: "" });

    expect(result.success).toBe(true);
  });

  it("menyunting tidak meminta kata sandi", () => {
    const result = updateUserSchema.safeParse({ ...base, id: "user-1", password: undefined });

    expect(result.success).toBe(true);
  });

  it("mengenali ketujuh role yang ada di skema Prisma", () => {
    expect(ROLE_CODES).toEqual(Object.values(RoleCode));
    expect(ROLE_CODES).toHaveLength(7);
  });
});

describe("wouldRemoveLastAdmin", () => {
  it("menahan pencabutan role Administrator yang terakhir", () => {
    expect(
      wouldRemoveLastAdmin({ activeAdmins: 1, wasActiveAdmin: true, willBeActiveAdmin: false }),
    ).toBe(true);
  });

  it("menahan penonaktifan Administrator yang terakhir", () => {
    // Menonaktifkan dan mencabut role sama akibatnya: tidak ada lagi yang dapat
    // membuka halaman data acuan untuk mengangkat Administrator baru.
    expect(
      wouldRemoveLastAdmin({ activeAdmins: 1, wasActiveAdmin: true, willBeActiveAdmin: false }),
    ).toBe(true);
  });

  it("membiarkannya bila masih ada Administrator aktif lain", () => {
    expect(
      wouldRemoveLastAdmin({ activeAdmins: 2, wasActiveAdmin: true, willBeActiveAdmin: false }),
    ).toBe(false);
  });

  it("tidak menghalangi penyuntingan yang mempertahankan rolenya", () => {
    expect(
      wouldRemoveLastAdmin({ activeAdmins: 1, wasActiveAdmin: true, willBeActiveAdmin: true }),
    ).toBe(false);
  });

  it("tidak menghalangi pengguna yang memang bukan Administrator aktif", () => {
    expect(
      wouldRemoveLastAdmin({ activeAdmins: 1, wasActiveAdmin: false, willBeActiveAdmin: false }),
    ).toBe(false);
  });

  it("mengenali role Administrator dari daftarnya", () => {
    expect(hasAdminRole(["QA", "ADMIN"])).toBe(true);
    expect(hasAdminRole(["QA", "QA_HEAD"])).toBe(false);
  });
});

describe("catalogEntrySchema", () => {
  const base = { code: "crack_broken", name: "Crack / Broken" };

  it("menormalkan kode menjadi huruf besar dan membolehkan garis bawah", () => {
    const result = catalogEntrySchema.safeParse(base);

    expect(result.success).toBe(true);
    expect(result.success ? result.data.code : null).toBe("CRACK_BROKEN");
  });

  it("memberi urutan tampil bawaan nol", () => {
    const result = catalogEntrySchema.safeParse(base);

    expect(result.success ? result.data.sortOrder : null).toBe(0);
  });

  it("menolak urutan tampil yang bukan bilangan bulat tak negatif", () => {
    expect(catalogEntrySchema.safeParse({ ...base, sortOrder: "-1" }).success).toBe(false);
    expect(catalogEntrySchema.safeParse({ ...base, sortOrder: "1.5" }).success).toBe(false);
    expect(catalogEntrySchema.safeParse({ ...base, sortOrder: "7" }).success).toBe(true);
  });

  it("memecah alamat tambahan yang ditulis sebagai satu kotak teks", () => {
    // Alamat disalin dari tempat lain dengan pemisah yang berbeda-beda; ketiganya
    // diterima supaya orang tidak perlu merapikannya lebih dulu.
    const result = catalogEntrySchema.safeParse({
      ...base,
      extraEmails: " QA@nifco.co.id\nmanajemen@nifco.co.id, pabrik@nifco.co.id ; \n",
    });

    expect(result.success).toBe(true);
    expect(result.success ? result.data.extraEmails : null).toEqual([
      "qa@nifco.co.id",
      "manajemen@nifco.co.id",
      "pabrik@nifco.co.id",
    ]);
  });

  it("menolak alamat tambahan yang tidak berbentuk email", () => {
    const result = catalogEntrySchema.safeParse({ ...base, extraEmails: "qa@nifco.co.id\nbukan" });

    expect(result.success).toBe(false);
  });

  it("menerima kotak alamat yang kosong", () => {
    const result = catalogEntrySchema.safeParse({ ...base, extraEmails: "   " });

    expect(result.success).toBe(true);
    expect(result.success ? result.data.extraEmails : null).toEqual([]);
  });

  it("menolak kode yang mengandung spasi", () => {
    expect(errorsFor(catalogEntrySchema.safeParse({ ...base, code: "CRACK BROKEN" }), "code"))
      .toHaveLength(1);
  });
});

describe("CATALOGS", () => {
  it("mencakup keenam daftar yang belum tersentuh sebelumnya", () => {
    expect(CATALOG_SLUGS).toEqual([
      "customers",
      "parts",
      "nc-details",
      "product-categories",
      "documents",
      "recipient-groups",
    ]);
  });

  it("tiap slug punya definisinya sendiri", () => {
    for (const slug of CATALOG_SLUGS) {
      expect(CATALOGS[slug].slug, slug).toBe(slug);
      expect(CATALOGS[slug].title.length, slug).toBeGreaterThan(0);
    }
  });

  it("hanya part yang punya kolom tambahan, hanya grup email yang punya penerima", () => {
    const withExtra = CATALOG_SLUGS.filter((slug) => CATALOGS[slug].extraField);
    const withRecipients = CATALOG_SLUGS.filter((slug) => CATALOGS[slug].hasRecipients);

    expect(withExtra).toEqual(["parts"]);
    expect(withRecipients).toEqual(["recipient-groups"]);
  });

  it("menolak slug yang tidak dikenal", () => {
    expect(isCatalogSlug("customers")).toBe(true);
    expect(isCatalogSlug("users")).toBe(false);
    expect(isCatalogSlug("../etc/passwd")).toBe(false);
  });
});

describe("galat alamat tambahan", () => {
  it("dilaporkan pada kolomnya, bukan pada elemen ke-sekian", () => {
    // Kunci "extraEmails.1" tidak pernah sampai ke kotak teksnya, sehingga pengisi
    // hanya melihat "periksa kembali" tanpa tahu baris mana yang salah.
    const result = catalogEntrySchema.safeParse({
      code: "QA_ONLY",
      name: "QA saja",
      extraEmails: "qa@nifco.co.id\nbukan\njuga-bukan",
    });

    expect(result.success).toBe(false);
    expect(errorsFor(result, "extraEmails")).toHaveLength(1);
    expect(errorsFor(result, "extraEmails.1")).toHaveLength(0);
  });

  it("menyebut alamat mana yang bermasalah", () => {
    const result = catalogEntrySchema.safeParse({
      code: "QA_ONLY",
      name: "QA saja",
      extraEmails: "qa@nifco.co.id\nbukan\njuga-bukan",
    });

    expect(errorsFor(result, "extraEmails")[0]).toContain("bukan");
    expect(errorsFor(result, "extraEmails")[0]).toContain("juga-bukan");
  });
});
