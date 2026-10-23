import { headers } from "next/headers";

import type { ClaimStatus, Prisma } from "@/generated/prisma/client";

/**
 * Penulisan audit trail (§4). Setiap perpindahan status menulis satu baris, dan halaman
 * detail klaim membangun timeline-nya dari tabel ini (kriteria penerimaan #8).
 *
 * Ditulis di dalam transaksi yang sama dengan perubahan datanya, sehingga tidak mungkin
 * ada perubahan status tanpa jejak — atau sebaliknya.
 */

/** Klien Prisma atau klien transaksi; keduanya punya `auditLog.create`. */
export interface AuditClient {
  auditLog: {
    create(args: { data: Prisma.AuditLogUncheckedCreateInput }): Promise<unknown>;
  };
}

export interface AuditEntry {
  readonly actorId: string | null;
  readonly entityType: string;
  readonly entityId: string;
  readonly claimId?: string | null;
  readonly action: string;
  readonly fromStatus?: ClaimStatus | null;
  readonly toStatus?: ClaimStatus | null;
  readonly payloadDiff?: Prisma.InputJsonValue;
}

export interface RequestContext {
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

/**
 * Alamat IP dan user agent pemanggil, dibaca dari header request.
 *
 * `x-forwarded-for` dapat berisi rantai proxy; yang diambil entri pertama, yaitu klien
 * asli menurut proxy terdekat. Nilainya bisa dipalsukan bila portal dijalankan tanpa
 * reverse proxy tepercaya, jadi kolom ini untuk penelusuran, bukan untuk otorisasi.
 */
export async function readRequestContext(): Promise<RequestContext> {
  try {
    const headerList = await headers();
    const forwarded = headerList.get("x-forwarded-for");

    return {
      ipAddress: forwarded?.split(",")[0]?.trim() ?? headerList.get("x-real-ip"),
      userAgent: headerList.get("user-agent"),
    };
  } catch {
    // Di luar siklus request (mis. worker cron) header tidak tersedia.
    return { ipAddress: null, userAgent: null };
  }
}

export async function writeAuditLog(
  client: AuditClient,
  entry: AuditEntry,
  context?: RequestContext,
): Promise<void> {
  const requestContext = context ?? (await readRequestContext());

  await client.auditLog.create({
    data: {
      actorId: entry.actorId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      claimId: entry.claimId ?? null,
      action: entry.action,
      fromStatus: entry.fromStatus ?? null,
      toStatus: entry.toStatus ?? null,
      payloadDiff: entry.payloadDiff,
      ipAddress: requestContext.ipAddress,
      userAgent: requestContext.userAgent,
    },
  });
}

/**
 * Ringkasan perubahan field untuk kolom `payloadDiff`.
 *
 * Hanya field yang benar-benar berubah yang dicatat, supaya auto-save draft tiap 30 detik
 * tidak membanjiri audit trail dengan baris kosong (asumsi A-17).
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};

  for (const [key, next] of Object.entries(after)) {
    const previous = before[key];
    if (!sameValue(previous, next)) {
      diff[key] = { from: normalize(previous), to: normalize(next) };
    }
  }

  return diff;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Date || b instanceof Date) return normalize(a) === normalize(b);

  return Object.is(a, b);
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;

  return value;
}
