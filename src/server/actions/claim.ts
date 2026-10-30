"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import type { Claim, Prisma } from "@/generated/prisma/client";
import type { ClaimStatus, PartSide, QtyUnit } from "@/generated/prisma/enums";
import { assertTransition } from "@/lib/claim-state";
import { db, type DbTransaction } from "@/lib/db";
import { readRequestContext, writeAuditLog } from "@/lib/audit";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { nextClaimNo } from "@/lib/numbering";
import { assertCan, type ClaimContext } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { claimFolder, saveUpload, storage } from "@/lib/storage";
import {
  notifyClaimPublished,
  notifyClaimRevisionRequested,
  notifyClaimSubmitted,
} from "@/server/claim-notifications";
import {
  claimDraftSchema,
  claimReviewSchema,
  claimSubmitSchema,
  type ClaimDraft,
} from "@/schemas/claim";

/**
 * Server action Modul 1 (§6). Setiap aksi menempuh urutan yang sama:
 *
 *   requireActor → muat klaim → assertCan → assertTransition → mutasi → audit
 *
 * Urutannya bukan sekadar gaya: pemeriksaan izin dan pemeriksaan transisi dijalankan
 * sebelum apa pun ditulis, dan audit ditulis di transaksi yang sama dengan mutasinya,
 * sehingga tidak mungkin ada perubahan status tanpa jejak.
 *
 * Notifikasi email (§8) dan PDF (§9) menyusul pada Fase 3; titik sambungnya ditandai
 * komentar TODO di bawah agar tidak terlewat.
 */

export interface ActionResult {
  readonly ok: boolean;
  readonly message?: string;
  /** Galat per field dari Zod, untuk ditampilkan react-hook-form. */
  readonly fieldErrors?: Record<string, string[]>;
  /** Section wajib yang masih kosong — dipakai pop-up "Submission incomplete". */
  readonly missing?: string[];
}

type ClaimWithContext = Claim & {
  cpar: { responsibleDeptId: string; cftMembers: { departmentId: string }[] } | null;
};

function toContext(claim: ClaimWithContext): ClaimContext {
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

async function loadClaim(claimId: string): Promise<ClaimWithContext> {
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

// ─────────────────────────── Draft ───────────────────────────

/** Membuat draft kosong lalu membuka formulirnya. Dipanggil tombol "Issue new claim". */
export async function createClaimDraft(): Promise<never> {
  const actor = await requireActor();
  assertCan(actor, "claim.create");

  const context = await readRequestContext();

  const claim = await db.$transaction(async (tx) => {
    const created = await tx.claim.create({
      data: {
        status: "DRAFT",
        createdById: actor.id,
        parts: {
          create: [{ side: "STANDARD" }, { side: "ACTUAL" }],
        },
      },
    });

    await writeAuditLog(
      tx,
      {
        actorId: actor.id,
        entityType: "Claim",
        entityId: created.id,
        claimId: created.id,
        action: "claim.create",
        toStatus: "DRAFT",
      },
      context,
    );

    return created;
  });

  redirect(`/claims/${claim.id}/edit`);
}

/**
 * Auto-save draft (§6 Modul 1, tiap 30 detik) dan tombol "Save draft".
 *
 * Sengaja tidak menulis AuditLog: auto-save berjalan terus selama form terbuka, dan
 * mencatat tiap simpanan akan menenggelamkan timeline klaim (asumsi A-17). Yang dicatat
 * adalah peristiwa yang berarti — submit, approve, revisi.
 */
export async function saveClaimDraft(claimId: string, input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const claim = await loadClaim(claimId);

    assertCan(actor, "claim.update", toContext(claim));

    const parsed = claimDraftSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Sebagian isian belum berbentuk benar; perbaiki dulu sebelum menyimpan.",
        fieldErrors: flattenZodErrors(parsed.error),
      };
    }

    const { standard, actual, ...fields } = parsed.data;

    await db.$transaction(async (tx) => {
      await tx.claim.update({
        where: { id: claimId },
        data: { ...toClaimColumns(fields), draftSavedAt: new Date() },
      });

      await upsertPart(tx, claimId, "STANDARD", standard);
      await upsertPart(tx, claimId, "ACTUAL", actual);
    });

    revalidatePath(`/claims/${claimId}`);

    return { ok: true, message: "Draft tersimpan." };
  } catch (error) {
    return failure(error);
  }
}

// ─────────────────────── Submit claim information ───────────────────────

export async function submitClaim(claimId: string, input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const claim = await loadClaim(claimId);
    const context = toContext(claim);

    assertCan(actor, "claim.submit", context);
    assertTransition(claim.status, "PENDING_QA_HEAD_REVIEW", actor.roles);

    const parsed = claimSubmitSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Formulir belum lengkap. Periksa field yang ditandai.",
        fieldErrors: flattenZodErrors(parsed.error),
      };
    }

    // §7C mewajibkan bukti foto pada sisi Actual; tanpa itu klaim tidak bisa ditindaklanjuti.
    const actualPart = await db.claimPart.findUnique({
      where: { claimId_side: { claimId, side: "ACTUAL" } },
      select: { id: true },
    });

    const actualPhotos = actualPart
      ? await db.attachment.count({
          where: { entityType: "ClaimPart", entityId: actualPart.id, mimeType: { startsWith: "image/" } },
        })
      : 0;

    if (actualPhotos < 1) {
      return {
        ok: false,
        message: "Unggah minimal satu foto pada panel Actual sebelum mengirim klaim.",
        fieldErrors: { "actual.photos": ["Minimal satu foto."] },
      };
    }

    const { standard, actual, ...fields } = parsed.data;
    const requestContext = await readRequestContext();
    const wasRevision = claim.status === "REVISION_REQUESTED";
    const submittedAt = new Date();

    await db.$transaction(async (tx) => {
      // Claim No terbit sekali saja; pengiriman ulang setelah revisi memakai nomor yang sama.
      const claimNo = claim.claimNo ?? (await nextClaimNo(tx));

      await tx.claim.update({
        where: { id: claimId },
        data: {
          ...toClaimColumns(fields),
          claimNo,
          status: "PENDING_QA_HEAD_REVIEW",
          submittedAt,
          draftSavedAt: null,
          // Komentar revisi sebelumnya dibersihkan supaya tidak terbaca sebagai permintaan aktif.
          reviewComment: null,
        },
      });

      await upsertPart(tx, claimId, "STANDARD", standard);
      await upsertPart(tx, claimId, "ACTUAL", actual);

      if (!claim.claimNo) {
        // Lampiran draft tersimpan di folder sementara; dipindahkan agar jalurnya
        // mengikuti Claim No dan tetap bermakna saat ditelusuri dari luar aplikasi.
        await moveDraftAttachments(tx, claimId, claim.claimNo, claimNo);
      }

      await writeAuditLog(
        tx,
        {
          actorId: actor.id,
          entityType: "Claim",
          entityId: claimId,
          claimId,
          action: "claim.submit",
          fromStatus: claim.status,
          toStatus: "PENDING_QA_HEAD_REVIEW",
          payloadDiff: { claimNo, resubmission: wasRevision },
        },
        requestContext,
      );
    });

    // Pencetakan PDF menyalakan Chromium dan memakan waktu sekitar dua detik. Dijalankan
    // setelah respons terkirim supaya QA tidak menunggui layar yang membeku; klaimnya
    // sendiri sudah berpindah status di dalam transaksi di atas.
    after(async () => {
      await notifyClaimSubmitted(
        claimId,
        { id: actor.id, name: actor.name, jobTitle: actor.jobTitle },
        submittedAt,
      );
    });

    revalidatePath("/claims");
    revalidatePath(`/claims/${claimId}`);

    return { ok: true, message: "Claim information terkirim ke QA Dept. Head." };
  } catch (error) {
    return failure(error);
  }
}

// ─────────────────────── Review QA Dept. Head ───────────────────────

export async function reviewClaim(claimId: string, input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const claim = await loadClaim(claimId);
    const context = toContext(claim);

    const parsed = claimReviewSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Keputusan review belum lengkap.",
        fieldErrors: flattenZodErrors(parsed.error),
      };
    }

    const approving = parsed.data.decision === "APPROVE";
    const target: ClaimStatus = approving ? "PUBLISHED" : "REVISION_REQUESTED";

    assertCan(actor, approving ? "claim.review.approve" : "claim.review.revise", context);
    assertTransition(claim.status, target, actor.roles);

    const requestContext = await readRequestContext();
    const comment = parsed.data.comment?.trim() || null;
    const decidedAt = new Date();

    await db.$transaction(async (tx) => {
      await tx.claim.update({
        where: { id: claimId },
        data: {
          status: target,
          reviewedById: actor.id,
          reviewedAt: decidedAt,
          reviewComment: comment,
          publishedAt: approving ? decidedAt : null,
        },
      });

      await writeAuditLog(
        tx,
        {
          actorId: actor.id,
          entityType: "Claim",
          entityId: claimId,
          claimId,
          action: approving ? "claim.review.approve" : "claim.review.revise",
          fromStatus: claim.status,
          toStatus: target,
          payloadDiff: comment ? { comment } : undefined,
        },
        requestContext,
      );
    });

    after(async () => {
      const sender = { id: actor.id, name: actor.name, jobTitle: actor.jobTitle };

      if (approving) {
        await notifyClaimPublished(claimId, sender);
      } else {
        await notifyClaimRevisionRequested(claimId, sender, decidedAt, comment);
      }
    });

    revalidatePath("/claims");
    revalidatePath(`/claims/${claimId}`);

    return {
      ok: true,
      message: approving ? "Klaim disetujui dan diterbitkan." : "Permintaan revisi terkirim ke QA.",
    };
  } catch (error) {
    return failure(error);
  }
}

// ─────────────────────── Lampiran foto part ───────────────────────

export async function uploadPartPhoto(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();

    const claimId = String(formData.get("claimId") ?? "");
    const side = String(formData.get("side") ?? "") as PartSide;
    const caption = String(formData.get("caption") ?? "").trim();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError("Pilih berkas yang akan diunggah.");
    }

    if (side !== "STANDARD" && side !== "ACTUAL") {
      throw new ValidationError("Panel part tidak dikenal.");
    }

    const claim = await loadClaim(claimId);
    assertCan(actor, "claim.update", toContext(claim));

    const part = await db.claimPart.findUnique({
      where: { claimId_side: { claimId, side } },
      select: { id: true },
    });

    if (!part) throw new NotFoundError("Panel part belum dibuat.");

    // §7C membatasi lima foto per panel.
    const existing = await db.attachment.count({
      where: { entityType: "ClaimPart", entityId: part.id },
    });

    if (existing >= 5) {
      throw new ValidationError("Panel ini sudah memuat lima foto; hapus salah satu dulu.");
    }

    const saved = await saveUpload({
      file,
      folder: claimFolder(claim.claimNo, claim.id),
      entityType: "ClaimPart",
    });

    await db.attachment.create({
      data: {
        entityType: "ClaimPart",
        entityId: part.id,
        claimId,
        originalName: saved.originalName,
        mimeType: saved.mimeType,
        size: saved.size,
        path: saved.path,
        caption: caption || null,
        uploadedById: actor.id,
      },
    });

    revalidatePath(`/claims/${claimId}/edit`);

    return { ok: true, message: "Foto terunggah." };
  } catch (error) {
    return failure(error);
  }
}

export async function deletePartPhoto(attachmentId: string): Promise<ActionResult> {
  try {
    const actor = await requireActor();

    const attachment = await db.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment?.claimId) throw new NotFoundError("Lampiran tidak ditemukan.");

    const claim = await loadClaim(attachment.claimId);
    assertCan(actor, "claim.update", toContext(claim));

    // Soft delete: barisnya ditandai terhapus, berkasnya benar-benar dibuang karena
    // tidak ada dokumen lain yang merujuknya.
    await db.attachment.update({
      where: { id: attachmentId },
      data: { deletedAt: new Date() },
    });

    await storage.remove(attachment.path).catch(() => undefined);

    revalidatePath(`/claims/${attachment.claimId}/edit`);

    return { ok: true, message: "Foto dihapus." };
  } catch (error) {
    return failure(error);
  }
}

// ─────────────────────── Pembantu ───────────────────────

function flattenZodErrors(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }

  return fieldErrors;
}

/** Membuang string kosong opsional agar tidak tersimpan sebagai "" di kolom nullable. */
function emptyToNull(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;

  return value.trim() === "" ? null : value.trim();
}

type ClaimFormFields = Omit<ClaimDraft, "standard" | "actual">;

function toClaimColumns(fields: ClaimFormFields): Prisma.ClaimUncheckedUpdateInput {
  return {
    type: fields.type,
    dateOfOccurrence: fields.dateOfOccurrence,
    shiftOfOccurrence: fields.shiftOfOccurrence,
    dateOfReceived: fields.dateOfReceived,
    shiftOfReceived: fields.shiftOfReceived,
    failurePlace: fields.failurePlace,
    failurePlaceType: fields.failurePlaceType,
    problemOrigin: fields.problemOrigin,
    contactPerson: fields.contactPerson,
    contactEmail: fields.contactEmail,
    contactPhone: fields.contactPhone,
    internalPartNo: fields.internalPartNo,
    customerPartNo: fields.customerPartNo,
    partName: fields.partName,
    productCategoryId: emptyToNull(fields.productCategoryId),
    originPlantType: fields.originPlantType,
    originPlantDetail: emptyToNull(fields.originPlantDetail),
    occurrence: fields.occurrence,
    ncDetailId: emptyToNull(fields.ncDetailId),
    customerId: emptyToNull(fields.customerId),
    abnormalSource: fields.abnormalSource,
    qualityProblem: fields.qualityProblem,
    lotNo: fields.lotNo,
    kanbanNo: fields.kanbanNo,
    injectionDate: fields.injectionDate,
    assemblyDate: fields.assemblyDate,
    deliveryDate: fields.deliveryDate,
    suspectedProcessLine: fields.suspectedProcessLine,
  };
}

interface PartInput {
  partName?: string | undefined;
  nidPartNo?: string | undefined;
  qty?: number | undefined;
  qtyUnit?: QtyUnit | undefined;
  dimensionItem?: string | undefined;
  appearanceItem?: string | undefined;
  photoCaption?: string | undefined;
}

async function upsertPart(
  tx: DbTransaction,
  claimId: string,
  side: PartSide,
  input: PartInput | undefined,
): Promise<void> {
  if (!input) return;

  const data = {
    partName: input.partName,
    nidPartNo: input.nidPartNo,
    qty: input.qty,
    qtyUnit: input.qtyUnit,
    dimensionItem: emptyToNull(input.dimensionItem),
    appearanceItem: emptyToNull(input.appearanceItem),
    photoCaption: emptyToNull(input.photoCaption),
  };

  await tx.claimPart.upsert({
    where: { claimId_side: { claimId, side } },
    update: data,
    create: { ...data, claimId, side, qtyUnit: input.qtyUnit ?? "PCS" },
  });
}

async function moveDraftAttachments(
  tx: DbTransaction,
  claimId: string,
  previousClaimNo: string | null,
  claimNo: string,
): Promise<void> {
  const from = claimFolder(previousClaimNo, claimId);
  const to = claimFolder(claimNo, claimId);
  if (from === to) return;

  await storage.moveFolder(from, to);

  const attachments = await tx.attachment.findMany({
    where: { claimId, path: { startsWith: `${from}/` } },
    select: { id: true, path: true },
  });

  for (const attachment of attachments) {
    await tx.attachment.update({
      where: { id: attachment.id },
      data: { path: `${to}${attachment.path.slice(from.length)}` },
    });
  }
}
