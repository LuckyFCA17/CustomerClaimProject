import "server-only";

import type { CatalogRow } from "@/components/master/catalog-manager";
import { db } from "@/lib/db";
import type { CatalogSlug } from "@/lib/master-catalog";

/**
 * Membaca satu daftar acuan beserta berapa kali isinya sudah dipakai.
 *
 * Hitungan pemakaian bukan hiasan: ia yang memberi tahu admin apa yang akan hilang dari
 * pilihan ketika sebuah baris dinonaktifkan, dan mana baris yang sebenarnya belum pernah
 * dipakai siapa pun. Tanpa itu, menonaktifkan terasa seperti menebak.
 *
 * Tiap daftar punya tabel dan relasinya sendiri, jadi percabangannya dikumpulkan di satu
 * tempat ini — halaman dan komponennya tidak perlu tahu bedanya.
 */
export async function loadCatalogRows(slug: CatalogSlug): Promise<CatalogRow[]> {
  switch (slug) {
    case "customers": {
      const rows = await db.customer.findMany({
        orderBy: [{ isActive: "desc" }, { code: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
          _count: { select: { claims: true } },
        },
      });

      return rows.map((row) => ({
        ...base(row),
        usageCount: row._count.claims,
        usageLabel: "klaim",
      }));
    }

    case "parts": {
      const rows = await db.part.findMany({
        orderBy: [{ isActive: "desc" }, { internalPartNo: "asc" }],
        select: {
          id: true,
          internalPartNo: true,
          customerPartNo: true,
          name: true,
          isActive: true,
        },
      });

      // Part tidak punya relasi ke klaim — nomor partnya disalin ke klaim sebagai teks,
      // sehingga klaim lama tetap utuh walau master partnya berubah. Pemakaiannya
      // dihitung dari nomor itu.
      const usage = await db.claim.groupBy({
        by: ["internalPartNo"],
        where: { internalPartNo: { in: rows.map((row) => row.internalPartNo) } },
        _count: { _all: true },
      });

      const byPartNo = new Map(usage.map((entry) => [entry.internalPartNo, entry._count._all]));

      return rows.map((row) => ({
        id: row.id,
        code: row.internalPartNo,
        name: row.name,
        sortOrder: 0,
        extra: row.customerPartNo,
        roleCodes: [],
        extraEmails: [],
        isActive: row.isActive,
        usageCount: byPartNo.get(row.internalPartNo) ?? 0,
        usageLabel: "klaim",
      }));
    }

    case "nc-details": {
      const rows = await db.nonConformanceDetail.findMany({
        orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { code: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          sortOrder: true,
          isActive: true,
          _count: { select: { claims: true } },
        },
      });

      return rows.map((row) => ({
        ...base(row),
        sortOrder: row.sortOrder,
        usageCount: row._count.claims,
        usageLabel: "klaim",
      }));
    }

    case "product-categories": {
      const rows = await db.productCategory.findMany({
        orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { code: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          sortOrder: true,
          isActive: true,
          _count: { select: { claims: true } },
        },
      });

      return rows.map((row) => ({
        ...base(row),
        sortOrder: row.sortOrder,
        usageCount: row._count.claims,
        usageLabel: "klaim",
      }));
    }

    case "documents": {
      const rows = await db.initialDocument.findMany({
        orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { code: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          sortOrder: true,
          isActive: true,
          _count: { select: { requests: true } },
        },
      });

      return rows.map((row) => ({
        ...base(row),
        sortOrder: row.sortOrder,
        usageCount: row._count.requests,
        usageLabel: "permintaan",
      }));
    }

    case "recipient-groups": {
      const rows = await db.recipientGroup.findMany({
        orderBy: [{ isActive: "desc" }, { code: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          roleCodes: true,
          extraEmails: true,
          isActive: true,
        },
      });

      return rows.map((row) => ({
        ...base(row),
        roleCodes: row.roleCodes,
        extraEmails: row.extraEmails,
        usageCount: 0,
        usageLabel: "",
      }));
    }
  }
}

function base(row: { id: string; code: string; name: string; isActive: boolean }) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    sortOrder: 0,
    extra: null,
    roleCodes: [] as const,
    extraEmails: [] as const,
    isActive: row.isActive,
  };
}
