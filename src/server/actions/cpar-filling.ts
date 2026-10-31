"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import type { CparSectionKey } from "@/generated/prisma/enums";
import { readRequestContext, writeAuditLog } from "@/lib/audit";
import { assertTransition } from "@/lib/claim-state";
import {
  SECTION_LABEL,
  missingRequiredSections,
  verificationProgress,
  verifierCapacity,
} from "@/lib/cpar";
import { db } from "@/lib/db";
import {
  ForbiddenError,
  NotFoundError,
  SubmissionIncompleteError,
  ValidationError,
} from "@/lib/errors";
import { assertCan, assertCanFillSection, type ClaimContext } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { claimFolder, saveUpload, storage } from "@/lib/storage";
import { cparSectionSchema, verifySchema } from "@/schemas/cpar";
import {
  type ProcessStep,
  flowCompleteness,
  processFlowSchema,
} from "@/schemas/process-flow";
import {
  type TemporaryActionEntry,
  temporaryActionSchema,
} from "@/schemas/temporary-action";
import {
  notifyCparApproved,
  notifyCparRevisionRequested,
  notifyCparUnderVerification,
} from "@/server/claim-notifications";

/**
 * Server action Modul 3 (§6) — pengisian CPAR, submit final, dan rantai verifikasi.
 *
 * Tiga aturan yang dijaga di sini dan tidak diserahkan ke UI:
 *   · section yang bukan hak seseorang tidak dapat ditulis, walau server action dipanggil
 *     langsung (kriteria penerimaan #4);
 *   · submit final ditolak selama masih ada section wajib yang kosong, beserta daftarnya
 *     (kriteria penerimaan #7);
 *   · satu REVISE menaikkan siklus dan membuka kembali seluruh section — keputusan siklus
 *     lama tidak dihapus, hanya tidak lagi dihitung (§5).
 */

export interface ActionResult {
  readonly ok: boolean;
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  /** Terisi hanya saat submit final ditolak — isi pop-up "Submission incomplete". */
  readonly missingSections?: readonly string[];
}

type LoadedCpar = Awaited<ReturnType<typeof loadCpar>>;

async function loadCpar(claimId: string) {
  const cpar = await db.cpar.findUnique({
    where: { claimId },
    include: {
      claim: { select: { id: true, claimNo: true, status: true, createdById: true } },
      cftMembers: { select: { departmentId: true } },
      sections: true,
      verifications: { select: { role: true, decision: true, cycle: true } },
    },
  });

  if (!cpar) throw new NotFoundError("CPAR tidak ditemukan untuk klaim ini.");

  return cpar;
}

function toContext(cpar: LoadedCpar): ClaimContext {
  return {
    status: cpar.claim.status,
    createdById: cpar.claim.createdById,
    cpar: {
      responsibleDeptId: cpar.responsibleDeptId,
      cftMemberDeptIds: cpar.cftMembers.map((member) => member.departmentId),
    },
  };
}

function failure(error: unknown): ActionResult {
  if (error instanceof SubmissionIncompleteError) {
    return {
      ok: false,
      message: error.message,
      missingSections: error.missingSections,
    };
  }

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

function revalidateCpar(claimId: string): void {
  revalidatePath(`/cpar/${claimId}`);
  revalidatePath(`/claims/${claimId}`);
  revalidatePath("/claims");
}

// ─────────────────────── Pengisian section ───────────────────────

/**
 * Menyimpan satu section.
 *
 * Penyimpanan pertama memindahkan klaim `CPAR_ISSUED → CPAR_IN_PROGRESS` dalam transaksi
 * yang sama, sehingga status tidak pernah tertinggal di belakang isinya bila proses mati
 * di antara dua penulisan.
 */
export async function saveCparSection(claimId: string, input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const cpar = await loadCpar(claimId);
    const context = toContext(cpar);

    assertCan(actor, "cpar.section.fill", context);

    const parsed = cparSectionSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Isian section belum memadai.",
        fieldErrors: flattenZodErrors(parsed.error),
      };
    }

    const { key, content } = parsed.data;
    assertCanFillSection(actor, key, context);

    const section = cpar.sections.find((entry) => entry.key === key);
    if (!section) throw new NotFoundError(`Section ${SECTION_LABEL[key]} tidak ditemukan.`);

    // Section dikunci saat submit final. Selama CPAR menunggu verifikasi, isinya tidak
    // boleh berubah — verifier harus menilai lembar yang sama dengan yang dikirimkan.
    if (section.lockedAt) {
      throw new ForbiddenError(
        `Section ${SECTION_LABEL[key]} terkunci karena CPAR sedang diverifikasi.`,
        "cpar.section.fill",
      );
    }

    const requestContext = await readRequestContext();
    const isFirstFill = cpar.claim.status === "CPAR_ISSUED";

    if (isFirstFill) {
      assertTransition(cpar.claim.status, "CPAR_IN_PROGRESS", actor.roles);
    }

    await db.$transaction(async (tx) => {
      await tx.cparSection.update({
        where: { id: section.id },
        data: {
          content,
          filledById: actor.id,
          filledAt: new Date(),
          // Catatan revisi dari verifier dibersihkan begitu section itu diperbaiki,
          // supaya daftar "perlu revisi" menyusut sejalan dengan pekerjaannya.
          revisionNote: null,
        },
      });

      if (isFirstFill) {
        await tx.claim.update({ where: { id: claimId }, data: { status: "CPAR_IN_PROGRESS" } });
      }

      await writeAuditLog(
        tx,
        {
          actorId: actor.id,
          entityType: "CparSection",
          entityId: section.id,
          claimId,
          action: "cpar.section.fill",
          fromStatus: isFirstFill ? cpar.claim.status : null,
          toStatus: isFirstFill ? "CPAR_IN_PROGRESS" : null,
          payloadDiff: { section: key, cycle: cpar.cycle, length: content.length },
        },
        requestContext,
      );
    });

    revalidateCpar(claimId);

    return { ok: true, message: `${SECTION_LABEL[key]} tersimpan.` };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Menyimpan section tabel (Temporary action).
 *
 * Terpisah dari `saveCparSection` karena yang disimpan adalah barisnya, bukan paragraf:
 * section ini terisi ketika tabelnya punya baris, meski kolom `content`-nya kosong.
 */
export async function saveCparTemporaryAction(
  claimId: string,
  input: unknown,
): Promise<ActionResult> {
  const key: CparSectionKey = "TEMPORARY_ACTION";

  try {
    const actor = await requireActor();
    const cpar = await loadCpar(claimId);
    const context = toContext(cpar);

    assertCan(actor, "cpar.section.fill", context);
    assertCanFillSection(actor, key, context);

    const parsed = temporaryActionSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Periksa kembali baris tindakan penahan.",
        fieldErrors: flattenZodErrors(parsed.error),
      };
    }

    const section = cpar.sections.find((entry) => entry.key === key);
    if (!section) throw new NotFoundError(`Section ${SECTION_LABEL[key]} tidak ditemukan.`);

    if (section.lockedAt) {
      throw new ForbiddenError(
        `Section ${SECTION_LABEL[key]} terkunci karena CPAR sedang diverifikasi.`,
        "cpar.section.fill",
      );
    }

    const entries = parsed.data.entries;
    const note = (parsed.data.note ?? "").trim();

    const requestContext = await readRequestContext();
    const isFirstFill = cpar.claim.status === "CPAR_ISSUED";

    if (isFirstFill) {
      assertTransition(cpar.claim.status, "CPAR_IN_PROGRESS", actor.roles);
    }

    await db.$transaction(async (tx) => {
      await tx.cparSection.update({
        where: { id: section.id },
        data: {
          data: { entries, note },
          // `content` tetap diisi ringkasan terbaca supaya lembar cetak lama, ekspor,
          // dan pencarian teks tidak kehilangan isinya — tabelnya tetap sumber utama.
          content: summarizeEntries(entries, note),
          filledById: actor.id,
          filledAt: new Date(),
          revisionNote: null,
        },
      });

      if (isFirstFill) {
        await tx.claim.update({ where: { id: claimId }, data: { status: "CPAR_IN_PROGRESS" } });
      }

      await writeAuditLog(
        tx,
        {
          actorId: actor.id,
          entityType: "CparSection",
          entityId: section.id,
          claimId,
          action: "cpar.section.fill",
          fromStatus: isFirstFill ? cpar.claim.status : null,
          toStatus: isFirstFill ? "CPAR_IN_PROGRESS" : null,
          payloadDiff: { section: key, cycle: cpar.cycle, entries: entries.length },
        },
        requestContext,
      );
    });

    revalidateCpar(claimId);

    return {
      ok: true,
      message:
        entries.length === 0
          ? "Tabel tindakan penahan dikosongkan."
          : `${entries.length} baris tindakan penahan tersimpan.`,
    };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Menyimpan diagram alur proses.
 *
 * Disimpan sekalipun belum lengkap: memetakan urutan prosesnya dan menandai proses
 * suspek sering terjadi pada dua kesempatan berbeda — yang pertama sendirian, yang
 * kedua setelah dibahas bersama. Kelengkapannya diperiksa saat submit final, dan
 * kekurangannya sudah tampil di layar jauh sebelum itu.
 */
export async function saveCparProcessFlow(claimId: string, input: unknown): Promise<ActionResult> {
  const key: CparSectionKey = "PROCESS_FLOW";

  try {
    const actor = await requireActor();
    const cpar = await loadCpar(claimId);
    const context = toContext(cpar);

    assertCan(actor, "cpar.section.fill", context);
    assertCanFillSection(actor, key, context);

    const parsed = processFlowSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Periksa kembali urutan prosesnya.",
        fieldErrors: flattenZodErrors(parsed.error),
      };
    }

    const section = cpar.sections.find((entry) => entry.key === key);
    if (!section) throw new NotFoundError(`Section ${SECTION_LABEL[key]} tidak ditemukan.`);

    if (section.lockedAt) {
      throw new ForbiddenError(
        `Section ${SECTION_LABEL[key]} terkunci karena CPAR sedang diverifikasi.`,
        "cpar.section.fill",
      );
    }

    const steps = parsed.data.steps;
    const note = (parsed.data.note ?? "").trim();
    const completeness = flowCompleteness(parsed.data);

    const requestContext = await readRequestContext();
    const isFirstFill = cpar.claim.status === "CPAR_ISSUED";

    if (isFirstFill) {
      assertTransition(cpar.claim.status, "CPAR_IN_PROGRESS", actor.roles);
    }

    await db.$transaction(async (tx) => {
      await tx.cparSection.update({
        where: { id: section.id },
        data: {
          data: { steps, note },
          content: summarizeFlow(steps, note),
          filledById: actor.id,
          filledAt: new Date(),
          revisionNote: null,
        },
      });

      if (isFirstFill) {
        await tx.claim.update({ where: { id: claimId }, data: { status: "CPAR_IN_PROGRESS" } });
      }

      await writeAuditLog(
        tx,
        {
          actorId: actor.id,
          entityType: "CparSection",
          entityId: section.id,
          claimId,
          action: "cpar.section.fill",
          fromStatus: isFirstFill ? cpar.claim.status : null,
          toStatus: isFirstFill ? "CPAR_IN_PROGRESS" : null,
          payloadDiff: {
            section: key,
            cycle: cpar.cycle,
            steps: steps.length,
            suspectOccurrence: steps.filter((step) => step.suspectOccurrence).length,
            suspectOutflow: steps.filter((step) => step.suspectOutflow).length,
          },
        },
        requestContext,
      );
    });

    revalidateCpar(claimId);

    return {
      ok: true,
      message: completeness.isComplete
        ? `${steps.length} proses tersimpan, suspek occurrence dan outflow sudah ditandai.`
        : `${steps.length} proses tersimpan — ${completeness.missing.join(", ")}.`,
    };
  } catch (error) {
    return failure(error);
  }
}

/** Ringkasan alur sebagai satu baris teks, untuk kolom `content`. */
function summarizeFlow(steps: readonly ProcessStep[], note: string): string {
  if (steps.length === 0) return note;

  const chain = steps
    .map((step) => {
      const marks = [
        step.suspectOccurrence ? "occurrence" : null,
        step.suspectOutflow ? "outflow" : null,
      ].filter(Boolean);

      return marks.length > 0 ? `${step.name} [suspek ${marks.join(" & ")}]` : step.name;
    })
    .join(" → ");

  return [chain, note].filter(Boolean).join("\n");
}

/** Ringkasan satu baris per tindakan, untuk kolom `content`. */
function summarizeEntries(entries: readonly TemporaryActionEntry[], note: string): string {
  const lines = entries.map((entry) => {
    const figures = [
      entry.totalPcs !== undefined ? `${entry.totalPcs} pcs` : null,
      entry.totalBags !== undefined ? `${entry.totalBags} bags` : null,
      entry.okPcs !== undefined ? `OK ${entry.okPcs} pcs` : null,
      entry.ngPcs !== undefined ? `NG ${entry.ngPcs} pcs` : null,
    ].filter(Boolean);

    const tail = [figures.join(", "), entry.note?.trim()].filter(Boolean).join(" — ");

    return tail ? `${entry.label}: ${tail}` : entry.label;
  });

  return [...lines, note].filter(Boolean).join("\n");
}

// ─────────────────────── Evidence CPAR ───────────────────────

export async function uploadCparEvidence(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();

    const claimId = String(formData.get("claimId") ?? "");
    const caption = String(formData.get("caption") ?? "").trim();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError("Pilih berkas yang akan diunggah.");
    }

    const cpar = await loadCpar(claimId);
    assertCan(actor, "cpar.evidence.upload", toContext(cpar));

    const saved = await saveUpload({
      file,
      folder: claimFolder(cpar.claim.claimNo, claimId),
      entityType: "Cpar",
    });

    await db.attachment.create({
      data: {
        entityType: "Cpar",
        entityId: cpar.id,
        claimId,
        originalName: saved.originalName,
        mimeType: saved.mimeType,
        size: saved.size,
        path: saved.path,
        caption: caption || null,
        uploadedById: actor.id,
      },
    });

    revalidateCpar(claimId);

    return { ok: true, message: "Evidence terunggah." };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteCparEvidence(attachmentId: string): Promise<ActionResult> {
  try {
    const actor = await requireActor();

    const attachment = await db.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment?.claimId || attachment.entityType !== "Cpar") {
      throw new NotFoundError("Evidence tidak ditemukan.");
    }

    const cpar = await loadCpar(attachment.claimId);
    assertCan(actor, "cpar.evidence.upload", toContext(cpar));

    await db.attachment.update({ where: { id: attachmentId }, data: { deletedAt: new Date() } });
    await storage.remove(attachment.path).catch(() => undefined);

    revalidateCpar(attachment.claimId);

    return { ok: true, message: "Evidence dihapus." };
  } catch (error) {
    return failure(error);
  }
}

// ─────────────────────── Submit final ───────────────────────

/**
 * Mengirim CPAR ke rantai verifikasi.
 *
 * Section wajib yang kosong menghentikan langkah ini dan daftarnya dibawa serta di
 * `SubmissionIncompleteError`, bukan diringkas jadi "lengkapi dulu" — orang yang menekan
 * tombol perlu tahu persis section mana, tanpa harus menyisir tujuh kotak satu per satu.
 */
export async function submitCparFinal(claimId: string): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const cpar = await loadCpar(claimId);
    const context = toContext(cpar);

    assertCan(actor, "cpar.submitFinal", context);
    assertTransition(cpar.claim.status, "CPAR_UNDER_VERIFICATION", actor.roles);

    const missing = missingRequiredSections(cpar.sections);

    if (missing.length > 0) {
      throw new SubmissionIncompleteError(missing.map((key) => SECTION_LABEL[key]));
    }

    const requestContext = await readRequestContext();
    const submittedAt = new Date();

    await db.$transaction(async (tx) => {
      await tx.cparSection.updateMany({
        where: { cparId: cpar.id },
        data: { lockedAt: submittedAt },
      });

      await tx.cpar.update({ where: { id: cpar.id }, data: { submittedAt } });

      await tx.claim.update({
        where: { id: claimId },
        data: { status: "CPAR_UNDER_VERIFICATION" },
      });

      await writeAuditLog(
        tx,
        {
          actorId: actor.id,
          entityType: "Cpar",
          entityId: cpar.id,
          claimId,
          action: "cpar.submitFinal",
          fromStatus: cpar.claim.status,
          toStatus: "CPAR_UNDER_VERIFICATION",
          payloadDiff: { cparNo: cpar.cparNo, cycle: cpar.cycle, sections: cpar.sections.length },
        },
        requestContext,
      );
    });

    after(async () => {
      await notifyCparUnderVerification(claimId, {
        id: actor.id,
        name: actor.name,
        jobTitle: actor.jobTitle,
      });
    });

    revalidateCpar(claimId);

    return { ok: true, message: `${cpar.cparNo} dikirim ke rantai verifikasi.` };
  } catch (error) {
    return failure(error);
  }
}

// ─────────────────────── Verifikasi ───────────────────────

/**
 * Satu keputusan verifikasi.
 *
 * REVISE berlaku seketika: siklus naik, section dibuka kembali, dan keputusan VERIFIED
 * yang sudah masuk pada siklus itu tetap tersimpan sebagai riwayat tetapi tidak lagi
 * dihitung. VERIFIED hanya memindahkan status bila seluruh kapasitas wajib sudah setuju
 * pada siklus yang sama.
 */
export async function verifyCpar(claimId: string, input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const cpar = await loadCpar(claimId);
    const context = toContext(cpar);

    assertCan(actor, "cpar.verify", context);

    const parsed = verifySchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Keputusan verifikasi belum lengkap.",
        fieldErrors: flattenZodErrors(parsed.error),
      };
    }

    const { decision, targetSections } = parsed.data;
    const comment = (parsed.data.comment ?? "").trim() || null;

    // Kapasitas, bukan seluruh role: kunci unik Verification adalah (cpar, role, cycle).
    const capacity = verifierCapacity(actor.roles, actor.departmentId, cpar);

    if (!capacity) {
      throw new ForbiddenError(
        "Anda bukan salah satu verifier wajib untuk CPAR ini.",
        "cpar.verify",
      );
    }

    const already = cpar.verifications.find(
      (entry) => entry.role === capacity && entry.cycle === cpar.cycle,
    );

    if (already) {
      throw new ValidationError(
        `Kapasitas ${capacity} sudah memutuskan pada siklus ${cpar.cycle}. Satu keputusan per kapasitas per siklus.`,
      );
    }

    const nextStatus = decision === "REVISE" ? "CPAR_REVISION" : "CPAR_APPROVED";

    // Keputusan VERIFIED yang belum melengkapi rantai tidak memindahkan status, jadi
    // transisinya hanya diuji ketika memang akan terjadi.
    const progress = verificationProgress(
      [...cpar.verifications, { role: capacity, decision, cycle: cpar.cycle }],
      cpar.cycle,
    );
    const willTransition = decision === "REVISE" || progress.isComplete;

    if (willTransition) {
      assertTransition(cpar.claim.status, nextStatus, actor.roles);
    }

    const requestContext = await readRequestContext();
    const decidedAt = new Date();
    const nextCycle = cpar.cycle + 1;

    await db.$transaction(async (tx) => {
      await tx.verification.create({
        data: {
          cparId: cpar.id,
          role: capacity,
          verifierId: actor.id,
          decision,
          comment,
          targetSections,
          cycle: cpar.cycle,
          decidedAt,
        },
      });

      if (decision === "REVISE") {
        await tx.cpar.update({ where: { id: cpar.id }, data: { cycle: nextCycle } });

        // Seluruh section dibuka kembali, bukan hanya yang ditandai: perbaikan pada satu
        // section sering menuntut penyesuaian di section lain yang terkait.
        await tx.cparSection.updateMany({
          where: { cparId: cpar.id },
          data: { lockedAt: null },
        });

        if (targetSections.length > 0) {
          await tx.cparSection.updateMany({
            where: { cparId: cpar.id, key: { in: targetSections } },
            data: { revisionNote: comment },
          });
        }
      }

      if (willTransition) {
        await tx.claim.update({ where: { id: claimId }, data: { status: nextStatus } });
      }

      if (decision === "VERIFIED" && progress.isComplete) {
        await tx.cpar.update({ where: { id: cpar.id }, data: { approvedAt: decidedAt } });
      }

      await writeAuditLog(
        tx,
        {
          actorId: actor.id,
          entityType: "Cpar",
          entityId: cpar.id,
          claimId,
          action: "cpar.verify",
          fromStatus: willTransition ? cpar.claim.status : null,
          toStatus: willTransition ? nextStatus : null,
          payloadDiff: {
            decision,
            capacity,
            cycle: cpar.cycle,
            ...(comment ? { comment } : {}),
            ...(targetSections.length > 0 ? { targetSections } : {}),
          },
        },
        requestContext,
      );
    });

    const actorSummary = { id: actor.id, name: actor.name, jobTitle: actor.jobTitle };

    if (decision === "REVISE") {
      after(async () => {
        await notifyCparRevisionRequested(claimId, actorSummary, cpar.cycle, comment);
      });
    } else if (progress.isComplete) {
      after(async () => {
        await notifyCparApproved(claimId, actorSummary, cpar.cycle);
      });
    }

    revalidateCpar(claimId);

    if (decision === "REVISE") {
      return {
        ok: true,
        message: `CPAR dikembalikan untuk diperbaiki — siklus ${nextCycle} dibuka.`,
      };
    }

    return {
      ok: true,
      message: progress.isComplete
        ? `${cpar.cparNo} disetujui seluruh verifier.`
        : `Verifikasi Anda tercatat. Menunggu ${progress.pending.length} kapasitas lain.`,
    };
  } catch (error) {
    return failure(error);
  }
}
