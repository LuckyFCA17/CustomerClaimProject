"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { after } from "next/server";

import type { CparSectionKey } from "@/generated/prisma/enums";
import { readRequestContext, writeAuditLog } from "@/lib/audit";
import { assertTransition } from "@/lib/claim-state";
import {
  ACTION_ITEM_ENTITY,
  ACTION_PLAN_SECTIONS,
  INITIAL_DOCUMENT_ENTITY,
  SECTION_LABEL,
  isActionPlanSection,
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
import {
  type ActionItem,
  actionPlanSchema,
  itemIds,
  readActionPlan,
} from "@/schemas/action-plan";
import { cparSectionSchema, verifySchema } from "@/schemas/cpar";
import {
  type ProcessStep,
  flowCompleteness,
  processFlowSchema,
} from "@/schemas/process-flow";
import { type RootCauseFactor, filledWhys, rootCauseSchema } from "@/schemas/root-cause";
import {
  type TemporaryActionEntry,
  temporaryActionSchema,
} from "@/schemas/temporary-action";
import {
  notifyCparApproved,
  notifyCparRevisionRequested,
  notifyCparUnderVerification,
  notifyEvidenceRequested,
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

/**
 * Kedua sisi analisis akar masalah memakai action yang sama, jadi section tujuannya
 * ikut divalidasi — bukan diterima apa adanya dari klien.
 */
const rootCausePayloadSchema = rootCauseSchema.extend({
  sectionKey: z.enum(["ROOT_CAUSE_OCCURRENCE", "ROOT_CAUSE_OUTFLOW"], {
    message: "Section analisis tidak dikenal.",
  }),
});

/** Begitu pula kedua section yang berisi daftar tindakan bertanggung jawab. */
const actionPlanPayloadSchema = actionPlanSchema.extend({
  sectionKey: z.enum(ACTION_PLAN_SECTIONS, { message: "Section tidak dikenal." }),
});

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

/**
 * Menyimpan analisis akar masalah 4M1E untuk salah satu dari kedua sisinya.
 *
 * Satu action untuk occurrence dan outflow: isinya sama bentuknya, dan memisahkannya
 * hanya akan menghasilkan dua salinan kode yang lambat laun berbeda.
 */
export async function saveCparRootCause(claimId: string, input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const cpar = await loadCpar(claimId);
    const context = toContext(cpar);

    assertCan(actor, "cpar.section.fill", context);

    const parsed = rootCausePayloadSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Periksa kembali isian analisis.",
        fieldErrors: flattenZodErrors(parsed.error),
      };
    }

    const { sectionKey } = parsed.data;
    assertCanFillSection(actor, sectionKey, context);

    const section = cpar.sections.find((entry) => entry.key === sectionKey);
    if (!section) throw new NotFoundError(`Section ${SECTION_LABEL[sectionKey]} tidak ditemukan.`);

    if (section.lockedAt) {
      throw new ForbiddenError(
        `Section ${SECTION_LABEL[sectionKey]} terkunci karena CPAR sedang diverifikasi.`,
        "cpar.section.fill",
      );
    }

    const problem = (parsed.data.problem ?? "").trim();
    const conclusion = (parsed.data.conclusion ?? "").trim();
    const factors = parsed.data.factors;

    const requestContext = await readRequestContext();
    const isFirstFill = cpar.claim.status === "CPAR_ISSUED";

    if (isFirstFill) {
      assertTransition(cpar.claim.status, "CPAR_IN_PROGRESS", actor.roles);
    }

    await db.$transaction(async (tx) => {
      await tx.cparSection.update({
        where: { id: section.id },
        data: {
          data: { problem, factors, conclusion },
          content: summarizeRootCause(factors, conclusion),
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
            section: sectionKey,
            cycle: cpar.cycle,
            factors: factors.length,
            ng: factors.filter((factor) => factor.judgement === "NG").length,
          },
        },
        requestContext,
      );
    });

    revalidateCpar(claimId);

    const ng = factors.filter((factor) => factor.judgement === "NG").length;

    return {
      ok: true,
      message:
        ng > 0
          ? `${factors.length} faktor tersimpan, ${ng} dinilai NG.`
          : `${factors.length} faktor tersimpan — belum ada yang dinilai NG.`,
    };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Menyimpan daftar tindakan bertanggung jawab — perbaikan tetap maupun standardisasi.
 *
 * Satu action untuk kedua section: isinya sama bentuknya, dan memisahkannya hanya akan
 * menghasilkan dua salinan kode yang lambat laun berbeda. Section tujuannya ikut
 * divalidasi, bukan diterima apa adanya dari klien.
 *
 * Dua hal dikerjakan di sini dan tidak boleh diserahkan ke peramban. Pertama, penanda
 * baris diberikan server: evidence menempel pada penanda itu, dan penanda yang datang
 * dari klien dapat menunjuk baris milik klaim lain. Kedua, PIC diperiksa benar-benar ada
 * dan masih aktif — daftar pilihan di layar bisa saja sudah basi.
 */
export async function saveCparActionPlan(claimId: string, input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const cpar = await loadCpar(claimId);
    const context = toContext(cpar);

    assertCan(actor, "cpar.section.fill", context);

    const parsed = actionPlanPayloadSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Periksa kembali isian section ini.",
        fieldErrors: flattenZodErrors(parsed.error),
      };
    }

    const key = parsed.data.sectionKey;
    assertCanFillSection(actor, key, context);

    const section = cpar.sections.find((entry) => entry.key === key);
    if (!section) throw new NotFoundError(`Section ${SECTION_LABEL[key]} tidak ditemukan.`);

    if (section.lockedAt) {
      throw new ForbiddenError(
        `Section ${SECTION_LABEL[key]} terkunci karena CPAR sedang diverifikasi.`,
        "cpar.section.fill",
      );
    }

    const note = (parsed.data.note ?? "").trim();

    const picIds = [...new Set(parsed.data.items.map((item) => item.picId))];
    const people = await db.user.findMany({
      where: { id: { in: picIds }, isActive: true },
      select: { id: true, name: true },
    });
    const nameById = new Map(people.map((person) => [person.id, person.name]));

    const unknownPic: Record<string, string[]> = {};
    parsed.data.items.forEach((item, index) => {
      if (!nameById.has(item.picId)) {
        unknownPic[`items.${index}.picId`] = ["PIC tidak ditemukan atau sudah tidak aktif."];
      }
    });

    if (Object.keys(unknownPic).length > 0) {
      return { ok: false, message: "Periksa kembali PIC yang dipilih.", fieldErrors: unknownPic };
    }

    // Baris lama membawa penandanya sendiri; baris baru mendapat penanda di sini.
    const previous = readActionPlan(section.data);
    const previousIds = new Set(itemIds(previous));
    const picBefore = new Map(
      previous.items.filter((item) => item.id).map((item) => [item.id as string, item.picId]),
    );

    const items = parsed.data.items.map((item) => ({
      ...item,
      id: item.id && previousIds.has(item.id) ? item.id : randomUUID(),
    }));
    const survivingIds = new Set(items.map((item) => item.id));

    // Yang dikabarkan hanya penugasan yang berubah: baris baru, atau baris lama yang
    // berpindah orang. Menyimpan ulang daftar yang sama tidak boleh mengirim email kedua
    // kepada orang yang sudah tahu — dan daftar ini disimpan berkali-kali.
    const newlyAssigned = items.filter((item) => picBefore.get(item.id) !== item.picId);

    // Evidence milik baris yang dihapus ikut dilepas, supaya berkasnya tidak tertinggal
    // menempel pada tindakan yang tidak ada lagi di lembar mana pun.
    const orphaned = [...previousIds].filter((id) => !survivingIds.has(id));

    const requestContext = await readRequestContext();
    const isFirstFill = cpar.claim.status === "CPAR_ISSUED";

    if (isFirstFill) {
      assertTransition(cpar.claim.status, "CPAR_IN_PROGRESS", actor.roles);
    }

    await db.$transaction(async (tx) => {
      await tx.cparSection.update({
        where: { id: section.id },
        data: {
          data: { items, note },
          content: summarizeActionPlan(items, nameById, note),
          filledById: actor.id,
          filledAt: new Date(),
          revisionNote: null,
        },
      });

      if (orphaned.length > 0) {
        await tx.attachment.updateMany({
          where: {
            entityType: ACTION_ITEM_ENTITY,
            entityId: { in: orphaned },
            claimId,
            deletedAt: null,
          },
          data: { deletedAt: new Date() },
        });
      }

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
            items: items.length,
            withoutDate: items.filter((item) => !(item.implementedOn ?? "").trim()).length,
            evidenceReleased: orphaned.length,
          },
        },
        requestContext,
      );
    });

    // Satu email per orang, bukan per baris: seseorang yang diberi tiga tindakan
    // sekaligus perlu satu daftar, bukan tiga pesan yang datang berbarengan.
    const byPic = new Map<string, typeof newlyAssigned>();
    for (const item of newlyAssigned) {
      byPic.set(item.picId, [...(byPic.get(item.picId) ?? []), item]);
    }

    if (byPic.size > 0) {
      const actorSummary = { id: actor.id, name: actor.name, jobTitle: actor.jobTitle };

      after(async () => {
        for (const [picId, assigned] of byPic) {
          await notifyEvidenceRequested(claimId, actorSummary, {
            picId,
            items: assigned.map((item) => item.action),
            // Baris pertama yang berubah sudah cukup membedakan satu permintaan dari
            // permintaan berikutnya kepada orang yang sama; penandanya UUID.
            dedupeKey: `CPAR_EVIDENCE_REQUEST:${picId}:${assigned[0].id}`,
            dueDate: assigned[0].implementedOn || null,
          });
        }
      });
    }

    revalidateCpar(claimId);

    const missingDate = items.filter((item) => !(item.implementedOn ?? "").trim()).length;

    return {
      ok: true,
      message:
        items.length === 0
          ? `${SECTION_LABEL[key]} dikosongkan.`
          : missingDate === 0
            ? `${items.length} baris tersimpan.`
            : `${items.length} baris tersimpan — ${missingDate} belum punya tanggal implementasi.`,
    };
  } catch (error) {
    return failure(error);
  }
}

/** Ringkasan daftar tindakan sebagai teks, untuk kolom `content`. */
function summarizeActionPlan(
  items: readonly ActionItem[],
  nameById: ReadonlyMap<string, string>,
  note: string,
): string {
  const lines = items.map((item) => {
    const parts = [
      item.action,
      `PIC: ${nameById.get(item.picId) ?? "—"}`,
      item.implementedOn ? `implementasi: ${item.implementedOn}` : null,
      item.note || null,
    ].filter(Boolean);

    return parts.join(" — ");
  });

  return [...lines, note].filter(Boolean).join("\n");
}

/** Ringkasan analisis sebagai teks, untuk kolom `content`. */
function summarizeRootCause(factors: readonly RootCauseFactor[], conclusion: string): string {
  const lines = factors.map((factor) => {
    const parts = [
      `[${factor.category}] ${factor.item}`,
      factor.controlPoint ? `standar: ${factor.controlPoint}` : null,
      factor.actual ? `aktual: ${factor.actual}` : null,
      `judgement: ${factor.judgement}`,
    ].filter(Boolean);

    const whys = filledWhys(factor);
    const chain =
      whys.length > 0
        ? "\n" + whys.map((why, level) => `  Why ${level + 1}: ${why}`).join("\n")
        : "";

    return parts.join(" — ") + chain;
  });

  return [...lines, conclusion].filter(Boolean).join("\n");
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

/**
 * Evidence untuk satu baris tindakan, pada section mana pun yang memakainya.
 *
 * Section tujuannya tidak diminta dari klien melainkan dicari dari penandanya: penanda
 * itu UUID yang hanya ada pada satu baris, dan membiarkan klien menyebut sectionnya
 * sendiri membuka celah melampirkan berkas ke section yang bukan haknya.
 *
 * Hanya baris yang sudah tersimpan dapat menerima berkas, dan itu memang urutan
 * kerjanya: tindakan ditulis saat direncanakan, buktinya menyusul setelah dikerjakan.
 * Menerima unggahan untuk baris yang belum tersimpan akan meninggalkan berkas yang
 * menempel pada tindakan yang mungkin tidak pernah jadi.
 */
export async function uploadActionItemEvidence(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();

    const claimId = String(formData.get("claimId") ?? "");
    const itemId = String(formData.get("itemId") ?? "");
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError("Pilih berkas yang akan diunggah.");
    }

    const cpar = await loadCpar(claimId);
    assertCan(actor, "cpar.evidence.upload", toContext(cpar));

    const section = cpar.sections.find(
      (entry) =>
        isActionPlanSection(entry.key) && itemIds(readActionPlan(entry.data)).includes(itemId),
    );

    if (!section) {
      throw new ValidationError("Simpan dulu barisnya sebelum melampirkan evidence.");
    }

    if (section.lockedAt) {
      throw new ForbiddenError(
        `Section ${SECTION_LABEL[section.key]} terkunci karena CPAR sedang diverifikasi.`,
        "cpar.evidence.upload",
      );
    }

    const saved = await saveUpload({
      file,
      folder: claimFolder(cpar.claim.claimNo, claimId),
      entityType: ACTION_ITEM_ENTITY,
    });

    await db.attachment.create({
      data: {
        entityType: ACTION_ITEM_ENTITY,
        entityId: itemId,
        claimId,
        originalName: saved.originalName,
        mimeType: saved.mimeType,
        size: saved.size,
        path: saved.path,
        uploadedById: actor.id,
      },
    });

    revalidateCpar(claimId);

    return { ok: true, message: "Evidence terunggah." };
  } catch (error) {
    return failure(error);
  }
}

// ─────────────────────── Initial Document Request ───────────────────────

/**
 * Menunjuk pengguna yang diminta melengkapi satu dokumen.
 *
 * Dijaga izin pengisian section, bukan izin unggah: menunjuk orang adalah pembagian
 * pekerjaan di dalam CPAR, dan itu urusan QA bersama departemen penanggung jawab —
 * bukan siapa saja yang kebetulan boleh melampirkan berkas.
 */
export async function assignInitialDocumentPic(
  claimId: string,
  initialDocumentId: string,
  picId: string | null,
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const cpar = await loadCpar(claimId);

    assertCan(actor, "cpar.section.fill", toContext(cpar));

    const request = await db.cparInitialDocument.findUnique({
      where: { cparId_initialDocumentId: { cparId: cpar.id, initialDocumentId } },
      include: { initialDocument: { select: { name: true } } },
    });

    if (!request) throw new NotFoundError("Dokumen ini tidak diminta pada CPAR ini.");

    // Daftar pilihan di layar bisa saja sudah basi; orangnya diperiksa ulang di sini.
    let picName: string | null = null;

    if (picId) {
      const pic = await db.user.findFirst({
        where: { id: picId, isActive: true },
        select: { name: true },
      });

      if (!pic) throw new ValidationError("PIC tidak ditemukan atau sudah tidak aktif.");
      picName = pic.name;
    }

    const requestContext = await readRequestContext();

    await db.$transaction(async (tx) => {
      await tx.cparInitialDocument.update({
        where: { cparId_initialDocumentId: { cparId: cpar.id, initialDocumentId } },
        data: { picId },
      });

      await writeAuditLog(
        tx,
        {
          actorId: actor.id,
          entityType: "CparInitialDocument",
          entityId: initialDocumentId,
          claimId,
          action: "cpar.section.fill",
          payloadDiff: {
            initialDocument: request.initialDocument.name,
            cycle: cpar.cycle,
            picId,
          },
        },
        requestContext,
      );
    });

    // Hanya penunjukan yang benar-benar berubah yang dikabarkan. Menyimpan ulang nama
    // yang sama — yang terjadi tiap kali orang menyentuh daftar ini — tidak boleh
    // mengirim email kedua kepada orang yang sudah tahu.
    if (picId && picId !== request.picId) {
      after(async () => {
        await notifyEvidenceRequested(
          claimId,
          { id: actor.id, name: actor.name, jobTitle: actor.jobTitle },
          {
            picId,
            items: [request.initialDocument.name],
            dedupeKey: `CPAR_EVIDENCE_REQUEST:${cpar.id}:${initialDocumentId}:${picId}`,
          },
        );
      });
    }

    revalidateCpar(claimId);

    return {
      ok: true,
      message: picName
        ? `${request.initialDocument.name} diminta kepada ${picName}.`
        : `PIC untuk ${request.initialDocument.name} dikosongkan.`,
    };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Melampirkan dokumen yang diminta.
 *
 * Unggahan yang berhasil sekaligus menandai permintaannya terpenuhi, dalam satu
 * transaksi: dua penulisan terpisah dapat berhenti di tengah dan meninggalkan berkas
 * yang ada tetapi permintaan yang terbaca masih kosong.
 */
export async function uploadInitialDocument(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();

    const claimId = String(formData.get("claimId") ?? "");
    const initialDocumentId = String(formData.get("initialDocumentId") ?? "");
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError("Pilih berkas yang akan diunggah.");
    }

    const cpar = await loadCpar(claimId);
    assertCan(actor, "cpar.evidence.upload", toContext(cpar));

    const request = await db.cparInitialDocument.findUnique({
      where: { cparId_initialDocumentId: { cparId: cpar.id, initialDocumentId } },
      include: { initialDocument: { select: { name: true } } },
    });

    if (!request) throw new NotFoundError("Dokumen ini tidak diminta pada CPAR ini.");

    const saved = await saveUpload({
      file,
      folder: claimFolder(cpar.claim.claimNo, claimId),
      entityType: INITIAL_DOCUMENT_ENTITY,
    });

    const requestContext = await readRequestContext();

    await db.$transaction(async (tx) => {
      await tx.attachment.create({
        data: {
          entityType: INITIAL_DOCUMENT_ENTITY,
          entityId: initialDocumentId,
          claimId,
          originalName: saved.originalName,
          mimeType: saved.mimeType,
          size: saved.size,
          path: saved.path,
          uploadedById: actor.id,
        },
      });

      await tx.cparInitialDocument.update({
        where: { cparId_initialDocumentId: { cparId: cpar.id, initialDocumentId } },
        data: { fulfilledAt: request.fulfilledAt ?? new Date() },
      });

      await writeAuditLog(
        tx,
        {
          actorId: actor.id,
          entityType: "CparInitialDocument",
          entityId: initialDocumentId,
          claimId,
          action: "cpar.evidence.upload",
          payloadDiff: {
            initialDocument: request.initialDocument.name,
            cycle: cpar.cycle,
            file: saved.originalName,
          },
        },
        requestContext,
      );
    });

    revalidateCpar(claimId);

    return { ok: true, message: `${request.initialDocument.name} dilampirkan.` };
  } catch (error) {
    return failure(error);
  }
}

// ─────────────────────── Penghapusan berkas ───────────────────────

/** Ketiganya menempel pada klaim yang sama dan dijaga izin unggah yang sama. */
const EVIDENCE_ENTITIES: readonly string[] = [
  "Cpar",
  ACTION_ITEM_ENTITY,
  INITIAL_DOCUMENT_ENTITY,
];

export async function deleteCparEvidence(attachmentId: string): Promise<ActionResult> {
  try {
    const actor = await requireActor();

    const attachment = await db.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment?.claimId || !EVIDENCE_ENTITIES.includes(attachment.entityType)) {
      throw new NotFoundError("Evidence tidak ditemukan.");
    }

    const claimId = attachment.claimId;
    const cpar = await loadCpar(claimId);
    assertCan(actor, "cpar.evidence.upload", toContext(cpar));

    await db.attachment.update({ where: { id: attachmentId }, data: { deletedAt: new Date() } });
    await storage.remove(attachment.path).catch(() => undefined);

    // Permintaan dokumen yang berkasnya habis dihapus kembali menjadi belum terpenuhi.
    // Membiarkan tanda "dilampirkan" tetap menyala akan menyatakan dokumen yang tidak
    // ada — dan itulah tanda yang dibaca orang saat memutuskan CPAR boleh dikirim.
    if (attachment.entityType === INITIAL_DOCUMENT_ENTITY) {
      const remaining = await db.attachment.count({
        where: {
          entityType: INITIAL_DOCUMENT_ENTITY,
          entityId: attachment.entityId,
          claimId,
        },
      });

      if (remaining === 0) {
        await db.cparInitialDocument.update({
          where: {
            cparId_initialDocumentId: { cparId: cpar.id, initialDocumentId: attachment.entityId },
          },
          data: { fulfilledAt: null },
        });
      }
    }

    revalidateCpar(claimId);

    return { ok: true, message: "Berkas dihapus." };
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
