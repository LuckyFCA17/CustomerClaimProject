import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

/**
 * Model yang memakai soft delete (PLAN D7). Klaim tidak pernah dihapus permanen —
 * pembatalan diwakili status, bukan penghapusan baris (§4).
 */
const SOFT_DELETE_MODELS = new Set([
  "Department",
  "Role",
  "User",
  "NonConformanceDetail",
  "ProductCategory",
  "InitialDocument",
  "Customer",
  "Part",
  "RecipientGroup",
  "EmailTemplate",
  "Claim",
  "ClaimPart",
  "Cpar",
  "CparSection",
  "Verification",
  "MonitoringPeriod",
  "ImprovementReport",
  "Attachment",
  "GeneratedDocument",
  "Notification",
]);

const READ_OPERATIONS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
]);

type QueryArgs = { where?: Record<string, unknown> } & Record<string, unknown>;

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL belum diset. Salin .env.example ke .env terlebih dahulu.");
  }

  const base = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  return base.$extends({
    name: "soft-delete",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !SOFT_DELETE_MODELS.has(model)) {
            return query(args);
          }

          // Baris yang sudah dihapus lunak tidak pernah ikut terbaca, termasuk lewat findUnique
          // (Prisma mengizinkan filter non-unik selama kunci uniknya tetap ada).
          if (READ_OPERATIONS.has(operation)) {
            const typed = args as QueryArgs;
            return query({
              ...typed,
              where: { ...(typed.where ?? {}), deletedAt: null },
            } as typeof args);
          }

          // Penghapusan permanen ditutup di lapisan ini agar tidak ada jalur yang lolos
          // karena lupa memakai helper. Gunakan softDelete() di server action.
          if (operation === "delete" || operation === "deleteMany") {
            throw new Error(
              `Hard delete tidak diizinkan pada model ${model}. Pakai soft delete (set deletedAt).`,
            );
          }

          return query(args);
        },
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

/**
 * Klien di dalam `db.$transaction(...)`. Tipe bawaan `Prisma.TransactionClient` tidak
 * cocok di sini karena klien kita sudah diperluas extension soft delete, jadi tipenya
 * diturunkan dari klien yang benar-benar dipakai.
 */
export type DbTransaction = Omit<
  ExtendedPrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

const globalForPrisma = globalThis as unknown as { prisma?: ExtendedPrismaClient };

export const db: ExtendedPrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
