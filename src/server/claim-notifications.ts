import "server-only";

import type { NotificationType } from "@/generated/prisma/enums";
import { statusMeta } from "@/config/claim-status";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { draftLabel } from "@/lib/numbering";
import {
  dispatchNotification,
  emailsForDepartment,
  emailsForGroup,
  emailsForRoles,
  enqueueNotification,
  unique,
  withoutDuplicates,
} from "@/lib/notifications";
import { renderSubject } from "@/emails/templates";
import type { ClaimEmailPayload } from "@/emails/types";
import { generateClaimDocuments } from "@/server/claim-documents";

/**
 * Notifikasi Modul 1 (§8 baris 1, 2, dan 3).
 *
 * Seluruhnya dijalankan setelah transaksi perpindahan status commit. Urutannya:
 * cetak PDF → antrekan notifikasi → kirim. Kegagalan di tahap mana pun tidak pernah
 * membatalkan perubahan status yang sudah terjadi; yang gagal tercatat di tabel
 * Notification dan terlihat di halaman log.
 */

const TYPE_LABEL: Record<string, string> = {
  OFFICIAL: "Official",
  NON_OFFICIAL: "Non-Official",
  INFORMATION_ONLY: "Information Only",
};

function portalUrl(claimId: string): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

  return `${base}/claims/${claimId}`;
}

type PayloadExtras = Partial<
  Pick<
    ClaimEmailPayload,
    "comment" | "attachmentNames" | "cparNo" | "responsibleDept" | "cftMembers" | "initialDocuments" | "dueDate"
  >
>;

async function buildPayload(
  claimId: string,
  actor: { name: string; jobTitle: string },
  extra: PayloadExtras = {},
): Promise<ClaimEmailPayload> {
  const claim = await db.claim.findUniqueOrThrow({
    where: { id: claimId },
    include: {
      productCategory: { select: { name: true } },
      ncDetail: { select: { name: true } },
      customer: { select: { name: true } },
    },
  });

  return {
    claimId: claim.id,
    claimNo: claim.claimNo ?? draftLabel(claim.id),
    claimType: claim.type ? (TYPE_LABEL[claim.type] ?? claim.type) : "—",
    statusLabel: statusMeta(claim.status).label,
    partName: claim.partName,
    internalPartNo: claim.internalPartNo,
    customerPartNo: claim.customerPartNo,
    customerName: claim.customer?.name ?? null,
    ncDetail: claim.ncDetail?.name ?? null,
    productCategory: claim.productCategory?.name ?? null,
    dateOfOccurrence: claim.dateOfOccurrence ? formatDate(claim.dateOfOccurrence) : null,
    dateOfReceived: claim.dateOfReceived ? formatDate(claim.dateOfReceived) : null,
    qualityProblem: claim.qualityProblem,
    actorName: actor.name,
    actorJobTitle: actor.jobTitle,
    comment: extra.comment ?? null,
    portalUrl: portalUrl(claim.id),
    attachmentNames: extra.attachmentNames,
    cparNo: extra.cparNo ?? null,
    responsibleDept: extra.responsibleDept ?? null,
    cftMembers: extra.cftMembers,
    initialDocuments: extra.initialDocuments,
    dueDate: extra.dueDate ?? null,
  };
}

interface QueueInput {
  readonly type: NotificationType;
  readonly claimId: string;
  readonly dedupeKey: string;
  readonly to: readonly string[];
  readonly cc?: readonly string[];
  readonly payload: ClaimEmailPayload;
  readonly attachmentPaths?: readonly string[];
}

async function queueAndSend(input: QueueInput): Promise<void> {
  const to = unique(input.to);

  if (to.length === 0) {
    console.warn(`Notifikasi ${input.type} untuk klaim ${input.claimId} tidak punya penerima.`);
    return;
  }

  const notificationId = await db.$transaction((tx) =>
    enqueueNotification(tx, {
      type: input.type,
      claimId: input.claimId,
      dedupeKey: input.dedupeKey,
      subject: renderSubject(input.type, input.payload),
      recipients: to,
      ccRecipients: withoutDuplicates(to, input.cc ?? []),
      payload: input.payload,
      attachmentPaths: input.attachmentPaths,
    }),
  );

  // null berarti dedupeKey sudah pernah dipakai — email itu sudah pernah diantrekan.
  if (!notificationId) return;

  await dispatchNotification(notificationId);
}

/** §8 #1 — klaim di-submit QA, QA Dept. Head diminta mereview. */
export async function notifyClaimSubmitted(
  claimId: string,
  actor: { id: string; name: string; jobTitle: string },
  submittedAt: Date,
): Promise<void> {
  const documents = await generateClaimDocuments(claimId, actor.id);

  const payload = await buildPayload(claimId, actor, {
    attachmentNames: documents.map((document) => document.filename),
  });

  await queueAndSend({
    type: "CLAIM_REVIEW_REQUEST",
    claimId,
    // Pengiriman ulang setelah revisi adalah peristiwa baru, jadi waktunya ikut
    // masuk kunci — tanpa itu permintaan review kedua tidak akan pernah terkirim.
    dedupeKey: `CLAIM_REVIEW_REQUEST:${claimId}:${submittedAt.toISOString()}`,
    to: await emailsForRoles(["QA_HEAD"]),
    payload,
    attachmentPaths: documents.map((document) => document.path),
  });
}

/** §8 #2 — QA Dept. Head meminta revisi; hanya pembuat klaim yang perlu tahu. */
export async function notifyClaimRevisionRequested(
  claimId: string,
  actor: { id: string; name: string; jobTitle: string },
  reviewedAt: Date,
  comment: string | null,
): Promise<void> {
  const claim = await db.claim.findUniqueOrThrow({
    where: { id: claimId },
    select: { createdBy: { select: { email: true } } },
  });

  const payload = await buildPayload(claimId, actor, { comment });

  await queueAndSend({
    type: "CLAIM_REVISION_REQUEST",
    claimId,
    dedupeKey: `CLAIM_REVISION_REQUEST:${claimId}:${reviewedAt.toISOString()}`,
    to: [claim.createdBy.email],
    payload,
  });
}

/** §8 #3 — klaim disetujui; seluruh user portal menerima kedua PDF. */
export async function notifyClaimPublished(
  claimId: string,
  actor: { id: string; name: string; jobTitle: string },
): Promise<void> {
  // Dokumen dicetak ulang setelah approve supaya blok tanda tangan memuat nama
  // dan waktu persetujuan QA Dept. Head, bukan lembar yang masih kosong.
  const documents = await generateClaimDocuments(claimId, actor.id);

  const payload = await buildPayload(claimId, actor, {
    attachmentNames: documents.map((document) => document.filename),
  });

  await queueAndSend({
    type: "NEW_CUSTOMER_CLAIM",
    claimId,
    dedupeKey: `NEW_CUSTOMER_CLAIM:${claimId}`,
    to: await emailsForGroup("ALL_PORTAL_USERS"),
    payload,
    attachmentPaths: documents.map((document) => document.path),
  });
}

/** §8 #4 — CPAR terbit; departemen penanggung jawab dan anggota CFT diminta mengisinya. */
export async function notifyCparIssued(
  claimId: string,
  actor: { id: string; name: string; jobTitle: string },
): Promise<void> {
  const cpar = await db.cpar.findUniqueOrThrow({
    where: { claimId },
    include: {
      responsibleDept: { select: { id: true, name: true, email: true } },
      cftMembers: { include: { department: { select: { id: true, name: true, email: true } } } },
      initialDocuments: { include: { initialDocument: { select: { name: true } } } },
    },
  });

  const departmentIds = [cpar.responsibleDeptId, ...cpar.cftMembers.map((m) => m.departmentId)];

  // Penerima adalah orang, bukan hanya milis departemen: milis bisa saja belum diisi,
  // dan CPAR yang tidak terbaca siapa pun adalah kegagalan yang paling mahal di sini.
  const people = (
    await Promise.all(departmentIds.map((id) => emailsForDepartment(id)))
  ).flat();

  const mailboxes = [cpar.responsibleDept.email, ...cpar.cftMembers.map((m) => m.department.email)]
    .filter((email): email is string => Boolean(email));

  const payload = await buildPayload(claimId, actor, {
    cparNo: cpar.cparNo,
    responsibleDept: cpar.responsibleDept.name,
    cftMembers: cpar.cftMembers.map((member) => member.department.name),
    initialDocuments: cpar.initialDocuments.map((entry) => entry.initialDocument.name),
    dueDate: formatDate(cpar.dueDate),
  });

  await queueAndSend({
    type: "CPAR_REQUEST",
    claimId,
    dedupeKey: `CPAR_REQUEST:${cpar.id}:${cpar.cycle}`,
    to: unique([...people, ...mailboxes]),
    cc: await emailsForRoles(["QA_HEAD"]),
    payload,
  });
}

/** §8 #5 — klaim ditutup tanpa CPAR; seluruh user portal perlu tahu agar tidak menunggu. */
export async function notifyClaimIgnored(
  claimId: string,
  actor: { id: string; name: string; jobTitle: string },
  reason: string,
): Promise<void> {
  const evidence = await db.attachment.findMany({
    where: { entityType: "ClaimIgnoration", entityId: claimId },
    select: { path: true, originalName: true },
    orderBy: { createdAt: "asc" },
  });

  const payload = await buildPayload(claimId, actor, {
    comment: reason,
    attachmentNames: evidence.map((item) => item.originalName),
  });

  await queueAndSend({
    type: "CLAIM_IGNORATION",
    claimId,
    dedupeKey: `CLAIM_IGNORATION:${claimId}`,
    to: await emailsForGroup("ALL_PORTAL_USERS"),
    payload,
    attachmentPaths: evidence.map((item) => item.path),
  });
}
