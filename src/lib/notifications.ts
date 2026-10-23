import path from "node:path";

import type { NotificationType, Prisma } from "@/generated/prisma/client";
import type { RoleCode } from "@/generated/prisma/enums";
import { db, type DbTransaction } from "@/lib/db";
import { sendMail } from "@/lib/mailer";
import { storage } from "@/lib/storage";
import { renderClaimEmail } from "@/emails/templates";
import type { ClaimEmailPayload } from "@/emails/types";

/**
 * Antrean notifikasi (§8).
 *
 * Dua langkah yang sengaja dipisah:
 *   enqueueNotification — menulis baris Notification di dalam transaksi perpindahan status
 *   dispatchNotification — mengirimnya setelah transaksi commit
 *
 * `dedupeKey` unik di basis data, jadi pengantrean yang sama dua kali tidak menghasilkan
 * dua email. Itulah yang membuat reminder harian tidak pernah dobel walau cron
 * ter-trigger berulang (kriteria penerimaan #5).
 */

export interface EnqueueInput {
  readonly type: NotificationType;
  readonly claimId: string;
  readonly dedupeKey: string;
  readonly subject: string;
  readonly recipients: readonly string[];
  readonly ccRecipients?: readonly string[];
  readonly payload: ClaimEmailPayload;
  /** Jalur relatif terhadap STORAGE_ROOT. */
  readonly attachmentPaths?: readonly string[];
}

/**
 * @returns id baris yang dibuat, atau null bila dedupeKey-nya sudah pernah dipakai.
 */
export async function enqueueNotification(
  tx: DbTransaction,
  input: EnqueueInput,
): Promise<string | null> {
  const existing = await tx.notification.findUnique({
    where: { dedupeKey: input.dedupeKey },
    select: { id: true },
  });

  if (existing) return null;

  const created = await tx.notification.create({
    data: {
      type: input.type,
      claimId: input.claimId,
      dedupeKey: input.dedupeKey,
      subject: input.subject,
      recipients: [...input.recipients],
      ccRecipients: [...(input.ccRecipients ?? [])],
      payload: input.payload as unknown as Prisma.InputJsonValue,
      attachmentPaths: [...(input.attachmentPaths ?? [])],
      status: "QUEUED",
    },
    select: { id: true },
  });

  return created.id;
}

/**
 * Mengirim satu notifikasi yang masih berstatus QUEUED.
 *
 * Kegagalan dicatat di barisnya sendiri dan tidak pernah dilempar ke pemanggil:
 * SMTP yang sedang mati tidak boleh menggagalkan aksi pengguna yang sudah selesai.
 * Barisnya tetap FAILED sehingga dapat dilihat di halaman log dan dicoba ulang.
 */
export async function dispatchNotification(notificationId: string): Promise<boolean> {
  const notification = await db.notification.findUnique({ where: { id: notificationId } });

  if (!notification || notification.status === "SENT") return false;

  try {
    const payload = notification.payload as unknown as ClaimEmailPayload;
    const { html, text } = await renderClaimEmail(notification.type, payload);

    const attachments = await Promise.all(
      notification.attachmentPaths.map(async (relativePath) => ({
        filename: path.basename(relativePath),
        content: await storage.read(relativePath),
        contentType: relativePath.endsWith(".pdf") ? "application/pdf" : undefined,
      })),
    );

    await sendMail({
      to: notification.recipients,
      cc: notification.ccRecipients,
      subject: notification.subject,
      html,
      text,
      attachments,
    });

    await db.notification.update({
      where: { id: notificationId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        attempts: { increment: 1 },
        errorMessage: null,
      },
    });

    return true;
  } catch (error) {
    await db.notification.update({
      where: { id: notificationId },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });

    return false;
  }
}

/** Mengirim seluruh antrean yang tertunda — dipakai worker cron pada Fase 7. */
export async function dispatchQueued(limit = 50): Promise<{ sent: number; failed: number }> {
  const queued = await db.notification.findMany({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });

  let sent = 0;
  let failed = 0;

  for (const row of queued) {
    if (await dispatchNotification(row.id)) sent += 1;
    else failed += 1;
  }

  return { sent, failed };
}

// ─────────────────────── Penerima ───────────────────────

/** Alamat seluruh pengguna aktif yang memegang salah satu role. */
export async function emailsForRoles(roles: readonly RoleCode[]): Promise<string[]> {
  if (roles.length === 0) return [];

  const users = await db.user.findMany({
    where: { isActive: true, roles: { some: { role: { code: { in: [...roles] } } } } },
    select: { email: true },
    orderBy: { email: "asc" },
  });

  return users.map((user) => user.email);
}

/**
 * Alamat sebuah grup penerima (§8, asumsi A-08).
 *
 * Grup disimpan sebagai data, bukan ditanam di kode, supaya admin dapat mempersempit
 * "seluruh user portal" tanpa perlu deploy ulang.
 */
export async function emailsForGroup(code: string): Promise<string[]> {
  const group = await db.recipientGroup.findUnique({ where: { code } });

  if (!group || !group.isActive) return [];

  const fromRoles = await emailsForRoles(group.roleCodes);

  return unique([...fromRoles, ...group.extraEmails]);
}

/** Alamat anggota aktif satu departemen, opsional disaring per role. */
export async function emailsForDepartment(
  departmentId: string,
  roles?: readonly RoleCode[],
): Promise<string[]> {
  const users = await db.user.findMany({
    where: {
      isActive: true,
      departmentId,
      ...(roles && roles.length > 0 ? { roles: { some: { role: { code: { in: [...roles] } } } } } : {}),
    },
    select: { email: true },
    orderBy: { email: "asc" },
  });

  return users.map((user) => user.email);
}

export function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

/** Membuang penerima yang sudah ada di daftar utama, agar tidak menerima dua salinan. */
export function withoutDuplicates(to: readonly string[], cc: readonly string[]): string[] {
  const primary = new Set(to);

  return unique(cc).filter((address) => !primary.has(address));
}
