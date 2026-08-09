import type { CounterScope } from "@/generated/prisma/enums";

/**
 * Klien Prisma minimum yang dibutuhkan generator nomor. Dipersempit agar fungsi ini
 * bisa dipanggil dengan klien transaksi (`tx`) maupun klien utama.
 */
export interface CounterClient {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

interface CounterRow {
  value: number;
}

function twoDigitYear(date: Date): string {
  return String(date.getFullYear() % 100).padStart(2, "0");
}

function twoDigitMonth(date: Date): string {
  return String(date.getMonth() + 1).padStart(2, "0");
}

/**
 * Menaikkan pencacah satu langkah dan mengembalikan nilai barunya.
 *
 * Satu statement `INSERT … ON CONFLICT DO UPDATE … RETURNING` bersifat atomik, jadi dua
 * permintaan bersamaan tidak akan pernah memperoleh nomor yang sama — tanpa perlu lock
 * eksplisit. Panggil di dalam transaksi yang sama dengan pembuatan record-nya, agar nomor
 * tidak "terbakar" ketika transaksi gagal.
 */
async function nextValue(client: CounterClient, scope: CounterScope, bucket: string): Promise<number> {
  const rows = await client.$queryRaw<CounterRow[]>`
    INSERT INTO "Counter" ("id", "scope", "bucket", "value", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, ${scope}::"CounterScope", ${bucket}, 1, NOW(), NOW())
    ON CONFLICT ("scope", "bucket")
    DO UPDATE SET "value" = "Counter"."value" + 1, "updatedAt" = NOW()
    RETURNING "value"
  `;

  const value = rows[0]?.value;

  if (typeof value !== "number") {
    throw new Error(`Gagal menaikkan pencacah ${scope}/${bucket}.`);
  }

  return value;
}

/** Claim No: `NID/CC/{YY}/{MM}/{0001}` — pencacah direset tiap bulan. */
export async function nextClaimNo(client: CounterClient, now: Date = new Date()): Promise<string> {
  const yy = twoDigitYear(now);
  const mm = twoDigitMonth(now);
  const value = await nextValue(client, "CLAIM", `${yy}-${mm}`);

  return `NID/CC/${yy}/${mm}/${String(value).padStart(4, "0")}`;
}

/** CPAR No: `NID/CPAR/{YY}/{0001}` — pencacah direset tiap tahun. */
export async function nextCparNo(client: CounterClient, now: Date = new Date()): Promise<string> {
  const yy = twoDigitYear(now);
  const value = await nextValue(client, "CPAR", yy);

  return `NID/CPAR/${yy}/${String(value).padStart(4, "0")}`;
}

/** Format nomor untuk klaim yang masih DRAFT dan belum punya Claim No. */
export function draftLabel(claimId: string): string {
  return `DRAFT-${claimId.slice(-6).toUpperCase()}`;
}
