"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import type { Claim } from "@/generated/prisma/client";
import { assertTransition } from "@/lib/claim-state";
import { endOfWorkingDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { readRequestContext, writeAuditLog } from "@/lib/audit";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { nextCparNo } from "@/lib/numbering";
import { assertCan, type ClaimContext } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { claimFolder, saveUpload, storage } from "@/lib/storage";
import { followUpSchema, ignoreSchema } from "@/schemas/cpar";
import { notifyClaimIgnored, notifyCparIssued } from "@/server/claim-notifications";

/**
 * Server action Modul 2 (§6).
 *
 * Dua jalur dari klaim yang sudah terbit, dan keduanya menutup satu sama lain: begitu
 * CPAR terbit klaim tidak bisa lagi di-ignore, dan sebaliknya. Yang menjamin itu adalah
 * state machine, bukan tombol yang disembunyikan.
 */

export interface ActionResult {
  readonly ok: boolean;
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

type ClaimWithCpar = Claim & {
  cpar: { responsibleDeptId: string; cftMembers: { departmentId: string }[] } | null;
};

function toContext(claim: ClaimWithCpar): ClaimContext {
  return {
    status: claim.status,
    createdById: claim.createdById,
    cpar: claim.cpar
      ? {
          responsibleDeptId: claim.cpar.responsibleDeptId,
          cftMemberDeptIds: claim.cpar.cftMembers.map((member) => member.departmentId),
        }
      : null,
  };
}

async function loadClaim(claimId: string): Promise<ClaimWithCpar> {
  const claim = await db.claim.findUnique({
    where: { id: claimId },
    include: { cpar: { select: { responsibleDeptId: true, cftMembers: true } } },
  });

  if (!claim) throw new NotFoundError("Klaim tidak ditemukan.");

  return claim;
}

function failure(error: unknown): ActionResult {
  if (error instanceof Error && "httpStatus" in error) {
    return { ok: false, message: error.message };
  }

  throw error;
}

function flattenZodErrors(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }

  return fieldErrors;
}

// ─────────────────────── Jalur Follow Up ───────────────────────

export async function followUpClaim(claimId: string, input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const claim = await loadClaim(claimId);
    const context = toContext(claim);

    assertCan(actor, "claim.followUp", context);
    assertTransition(claim.status, "CPAR_ISSUED", actor.roles);

    const parsed = followUpSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Periksa kembali isian penetapan penanggung jawab.",
        fieldErrors: flattenZodErrors(parsed.error),
      };
    }

    const { responsibilityType, responsibleDeptId, cftMemberDeptIds, initialDocumentIds, note } =
      parsed.data;

    // Input tanggal hanya mengirim Y-M-D, sehingga tenggat akan tersimpan pukul 00:00 UTC
    // alias 07:00 WIB — lewat tenggat sejak pagi hari H. Dinormalkan ke akhir jam kerja.
    const dueDate = endOfWorkingDay(parsed.data.dueDate);

    if (dueDate.getTime() < Date.now()) {
      return {
        ok: false,
        message: "Tenggat sudah lewat.",
        fieldErrors: { dueDate: ["Pilih tanggal hari ini atau sesudahnya."] },
      };
    }

    // Departemen dan dokumen berasal dari kiriman klien, jadi keberadaannya diperiksa
    // di sini — bukan diserahkan kepada galat foreign key yang pesannya tidak terbaca.
    const departmentIds = [responsibleDeptId, ...cftMemberDeptIds];
    const departments = await db.department.findMany({
      where: { id: { in: departmentIds }, isActive: true },
      select: { id: true },
    });

    if (departments.length !== new Set(departmentIds).size) {
      throw new ValidationError("Ada departemen yang tidak dikenal atau sudah nonaktif.");
    }

    const documents = await db.initialDocument.findMany({
      where: { id: { in: initialDocumentIds }, isActive: true },
      select: { id: true },
    });

    if (documents.length !== new Set(initialDocumentIds).size) {
      throw new ValidationError("Ada dokumen yang tidak dikenal atau sudah nonaktif.");
    }

    const requestContext = await readRequestContext();
    const issuedAt = new Date();

    const cparNo = await db.$transaction(async (tx) => {
      const number = await nextCparNo(tx, issuedAt);

      const cpar = await tx.cpar.create({
        data: {
          claimId,
          cparNo: number,
          responsibilityType,
          responsibleDeptId,
          dueDate,
          issuedAt,
          cftMembers: {
            create: cftMemberDeptIds.map((departmentId) => ({ departmentId })),
          },
          initialDocuments: {
            create: initialDocumentIds.map((initialDocumentId) => ({ initialDocumentId })),
          },
          // Kedelapan section dibuat kosong sejak awal agar hak isi per role dapat
          // dievaluasi tanpa menunggu seseorang menyentuhnya lebih dulu.
          sections: {
            create: [
              { key: "PROBLEM_DESCRIPTION" },
              { key: "TEMPORARY_ACTION" },
              { key: "PROCESS_FLOW" },
              { key: "ROOT_CAUSE_OCCURRENCE" },
              { key: "ROOT_CAUSE_OUTFLOW" },
              { key: "PERMANENT_COUNTERMEASURE" },
              { key: "STANDARDIZATION_HORIZONTAL" },
              { key: "EFFECTIVENESS_PLAN" },
            ],
          },
        },
      });

      await tx.claim.update({ where: { id: claimId }, data: { status: "CPAR_ISSUED" } });

      await writeAuditLog(
        tx,
        {
          actorId: actor.id,
          entityType: "Cpar",
          entityId: cpar.id,
          claimId,
          action: "claim.followUp",
          fromStatus: claim.status,
          toStatus: "CPAR_ISSUED",
          payloadDiff: {
            cparNo: number,
            responsibilityType,
            dueDate: dueDate.toISOString(),
            cftMembers: cftMemberDeptIds.length,
            initialDocuments: initialDocumentIds.length,
            ...(note ? { comment: note } : {}),
          },
        },
        requestContext,
      );

      return number;
    });

    after(async () => {
      await notifyCparIssued(claimId, {
        id: actor.id,
        name: actor.name,
        jobTitle: actor.jobTitle,
      });
    });

    revalidatePath("/claims");
    revalidatePath(`/claims/${claimId}`);

    return { ok: true, message: `${cparNo} diterbitkan ke departemen penanggung jawab.` };
  } catch (error) {
    return failure(error);
  }
}

// ─────────────────────── Jalur Ignore ───────────────────────

export async function ignoreClaim(claimId: string, input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const claim = await loadClaim(claimId);
    const context = toContext(claim);

    assertCan(actor, "claim.ignore", context);
    assertTransition(claim.status, "IGNORED", actor.roles);

    const parsed = ignoreSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Alasan penutupan belum memadai.",
        fieldErrors: flattenZodErrors(parsed.error),
      };
    }

    // Klaim Official dan Non-Official boleh ditutup tanpa CPAR, tapi memerlukan
    // konfirmasi kedua supaya tidak terjadi karena salah klik (asumsi A-02).
    if (claim.type !== "INFORMATION_ONLY" && !parsed.data.acknowledged) {
      return {
        ok: false,
        message:
          "Klaim ini bukan Information Only. Centang konfirmasi bahwa klaim ditutup tanpa CPAR.",
        fieldErrors: { acknowledged: ["Konfirmasi diperlukan."] },
      };
    }

    const evidenceCount = await db.attachment.count({
      where: { entityType: "ClaimIgnoration", entityId: claimId },
    });

    if (evidenceCount < 1) {
      return {
        ok: false,
        message: "Unggah minimal satu evidence sebelum menutup klaim.",
        fieldErrors: { evidence: ["Minimal satu berkas."] },
      };
    }

    const requestContext = await readRequestContext();
    const ignoredAt = new Date();
    const reason = parsed.data.reason.trim();

    await db.$transaction(async (tx) => {
      await tx.claim.update({
        where: { id: claimId },
        data: {
          status: "IGNORED",
          ignorationReason: reason,
          ignoredAt,
          ignoredById: actor.id,
          closedAt: ignoredAt,
        },
      });

      await writeAuditLog(
        tx,
        {
          actorId: actor.id,
          entityType: "Claim",
          entityId: claimId,
          claimId,
          action: "claim.ignore",
          fromStatus: claim.status,
          toStatus: "IGNORED",
          payloadDiff: { comment: reason, evidence: evidenceCount },
        },
        requestContext,
      );
    });

    after(async () => {
      await notifyClaimIgnored(
        claimId,
        { id: actor.id, name: actor.name, jobTitle: actor.jobTitle },
        reason,
      );
    });

    revalidatePath("/claims");
    revalidatePath(`/claims/${claimId}`);

    return { ok: true, message: "Klaim ditutup sebagai Ignored." };
  } catch (error) {
    return failure(error);
  }
}

// ─────────────────────── Evidence penutupan ───────────────────────

export async function uploadIgnorationEvidence(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();

    const claimId = String(formData.get("claimId") ?? "");
    const caption = String(formData.get("caption") ?? "").trim();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError("Pilih berkas yang akan diunggah.");
    }

    const claim = await loadClaim(claimId);
    assertCan(actor, "claim.ignore", toContext(claim));

    const saved = await saveUpload({
      file,
      folder: claimFolder(claim.claimNo, claim.id),
      entityType: "ClaimIgnoration",
    });

    await db.attachment.create({
      data: {
        entityType: "ClaimIgnoration",
        entityId: claimId,
        claimId,
        originalName: saved.originalName,
        mimeType: saved.mimeType,
        size: saved.size,
        path: saved.path,
        caption: caption || null,
        uploadedById: actor.id,
      },
    });

    revalidatePath(`/claims/${claimId}/ignore`);

    return { ok: true, message: "Evidence terunggah." };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteIgnorationEvidence(attachmentId: string): Promise<ActionResult> {
  try {
    const actor = await requireActor();

    const attachment = await db.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment?.claimId || attachment.entityType !== "ClaimIgnoration") {
      throw new NotFoundError("Evidence tidak ditemukan.");
    }

    const claim = await loadClaim(attachment.claimId);
    assertCan(actor, "claim.ignore", toContext(claim));

    await db.attachment.update({
      where: { id: attachmentId },
      data: { deletedAt: new Date() },
    });

    await storage.remove(attachment.path).catch(() => undefined);

    revalidatePath(`/claims/${attachment.claimId}/ignore`);

    return { ok: true, message: "Evidence dihapus." };
  } catch (error) {
    return failure(error);
  }
}
