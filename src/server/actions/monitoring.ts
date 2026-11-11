"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import type { Prisma } from "@/generated/prisma/client";
import { readRequestContext, writeAuditLog } from "@/lib/audit";
import { assertTransition } from "@/lib/claim-state";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  MONITORING_CHECK_ENTITY,
  MONITORING_PERIOD_ENTITY,
  closingBlocker,
  missingCheckEvidence,
  monitoringProgress,
  planPeriods,
} from "@/lib/monitoring";
import { assertCan, type ClaimContext } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { claimFolder, saveUpload, storage } from "@/lib/storage";
import {
  A3_BLOCKS,
  effectivenessSchema,
  improvementReportSchema,
  monitoringResultSchema,
  startMonitoringSchema,
} from "@/schemas/monitoring";
import {
  notifyCapaNotEffective,
  notifyMonitoringFinished,
  notifyMonitoringStarted,
} from "@/server/claim-notifications";

/**
 * Server action Modul 4 (§6) — pemantauan efektivitas CAPA.
 *
 * Dua jalan keluar dari `CAPA_MONITORING`, dan keduanya ditentukan data, bukan tombol:
 * satu periode `NOT_EFFECTIVE` memulangkan klaim ke `CPAR_REVISION` dengan siklus naik,
 * sedangkan penutupan hanya mungkin bila seluruh periode siklus berjalan `EFFECTIVE`.
 */

export interface ActionResult {
  readonly ok: boolean;
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

type LoadedClaim = Awaited<ReturnType<typeof loadClaim>>;

async function loadClaim(claimId: string) {
  const claim = await db.claim.findUnique({
    where: { id: claimId },
    include: {
      cpar: { select: { id: true, cycle: true, responsibleDeptId: true, cftMembers: true } },
      monitoring: { select: { id: true, periodNo: true, status: true, cycle: true } },
    },
  });

  if (!claim) throw new NotFoundError("Klaim tidak ditemukan.");

  return claim;
}

function toContext(claim: LoadedClaim): ClaimContext {
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

/** Siklus CPAR adalah siklus pemantauan; klaim tanpa CPAR tidak pernah sampai ke sini. */
function cycleOf(claim: LoadedClaim): number {
  if (!claim.cpar) {
    throw new ValidationError("Klaim ini belum memiliki CPAR, jadi belum dapat dipantau.");
  }

  return claim.cpar.cycle;
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

function revalidateMonitoring(claimId: string): void {
  revalidatePath(`/monitoring/${claimId}`);
  revalidatePath(`/cpar/${claimId}`);
  revalidatePath(`/claims/${claimId}`);
  revalidatePath("/monitoring");
  revalidatePath("/claims");
}

// ─────────────────────── Action Button C: membuka pemantauan ───────────────────────

export async function startMonitoring(claimId: string, input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const claim = await loadClaim(claimId);
    const context = toContext(claim);

    assertCan(actor, "monitoring.start", context);
    assertTransition(claim.status, "CAPA_MONITORING", actor.roles);

    const parsed = startMonitoringSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Periksa kembali jadwal pemantauan.",
        fieldErrors: flattenZodErrors(parsed.error),
      };
    }

    const cycle = cycleOf(claim);
    const { periodCount, intervalDays, checkItems, note } = parsed.data;

    // Siklus baru setelah Not Effective memakai nomor periode dari satu lagi: kunci
    // uniknya (claimId, cycle, periodNo) sudah memisahkan siklus, jadi penomoran
    // selalu mulai dari 1 dan tetap terbaca sebagai "periode ke-berapa di siklus ini".
    const existing = claim.monitoring.filter((period) => period.cycle === cycle);

    if (existing.length > 0) {
      throw new ValidationError(
        `Siklus ${cycle} sudah memiliki ${existing.length} periode pemantauan.`,
      );
    }

    const openedAt = new Date();
    const planned = planPeriods(periodCount, intervalDays, openedAt);
    const requestContext = await readRequestContext();

    await db.$transaction(async (tx) => {
      await tx.monitoringPeriod.createMany({
        data: planned.map((period) => ({
          claimId,
          cycle,
          periodNo: period.periodNo,
          dueDate: period.dueDate,
          // Seluruh periode dibuka sekaligus: pengumpulan evidence untuk periode kedua
          // sering berjalan sebelum periode pertama dinilai, dan menutupnya hanya
          // memaksa orang menyimpan bukti di tempat lain sampai gilirannya tiba.
          openedAt,
          note: period.periodNo === 1 ? (note ?? null) || null : null,
        })),
      });

      // Item check ditetapkan sekali untuk siklus ini, lalu disalin sebagai baris
      // penghubung ke tiap periode. Daftar yang sama pada setiap periode itulah yang
      // membuat periode 1 dan periode 3 dapat dibandingkan — item yang berubah di
      // tengah jalan akan membuat "membaik" tidak berarti apa-apa.
      await tx.monitoringCheckItem.createMany({
        data: checkItems.map((title, index) => ({ claimId, cycle, order: index + 1, title })),
      });

      const [createdPeriods, createdItems] = await Promise.all([
        tx.monitoringPeriod.findMany({ where: { claimId, cycle }, select: { id: true } }),
        tx.monitoringCheckItem.findMany({ where: { claimId, cycle }, select: { id: true } }),
      ]);

      await tx.monitoringCheck.createMany({
        data: createdPeriods.flatMap((period) =>
          createdItems.map((item) => ({ periodId: period.id, itemId: item.id })),
        ),
      });

      await tx.claim.update({ where: { id: claimId }, data: { status: "CAPA_MONITORING" } });

      await writeAuditLog(
        tx,
        {
          actorId: actor.id,
          entityType: "Claim",
          entityId: claimId,
          claimId,
          action: "monitoring.start",
          fromStatus: claim.status,
          toStatus: "CAPA_MONITORING",
          payloadDiff: {
            cycle,
            periodCount,
            intervalDays,
            checkItems,
            ...(note ? { comment: note } : {}),
          },
        },
        requestContext,
      );
    });

    after(async () => {
      await notifyMonitoringStarted(claimId, {
        id: actor.id,
        name: actor.name,
        jobTitle: actor.jobTitle,
      });
    });

    revalidateMonitoring(claimId);

    return {
      ok: true,
      message: `${periodCount} periode pemantauan dibuka untuk siklus ${cycle}, masing-masing dengan ${checkItems.length} item check.`,
    };
  } catch (error) {
    return failure(error);
  }
}

// ─────────────────────── Evidence periode ───────────────────────

export async function uploadMonitoringEvidence(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();

    const periodId = String(formData.get("periodId") ?? "");
    const caption = String(formData.get("caption") ?? "").trim();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError("Pilih berkas yang akan diunggah.");
    }

    const period = await db.monitoringPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, claimId: true, periodNo: true, status: true },
    });

    if (!period) throw new NotFoundError("Periode pemantauan tidak ditemukan.");

    const claim = await loadClaim(period.claimId);
    assertCan(actor, "monitoring.evidence.upload", toContext(claim));

    // Periode yang sudah dinilai tidak lagi menerima bukti: penilaiannya mengacu pada
    // berkas yang ada saat itu, dan menambah sesudahnya membuat catatan tidak cocok
    // dengan apa yang sebenarnya dinilai.
    if (period.status !== "PENDING") {
      throw new ForbiddenError(
        `Periode ${period.periodNo} sudah dinilai, evidence tidak dapat ditambah lagi.`,
        "monitoring.evidence.upload",
      );
    }

    const saved = await saveUpload({
      file,
      folder: claimFolder(claim.claimNo, claim.id),
      entityType: MONITORING_PERIOD_ENTITY,
    });

    await db.attachment.create({
      data: {
        entityType: MONITORING_PERIOD_ENTITY,
        entityId: period.id,
        claimId: claim.id,
        originalName: saved.originalName,
        mimeType: saved.mimeType,
        size: saved.size,
        path: saved.path,
        caption: caption || null,
        uploadedById: actor.id,
      },
    });

    revalidateMonitoring(claim.id);

    return { ok: true, message: "Evidence terunggah." };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteMonitoringEvidence(attachmentId: string): Promise<ActionResult> {
  try {
    const actor = await requireActor();

    const attachment = await db.attachment.findUnique({ where: { id: attachmentId } });

    // Dua jenis evidence pemantauan, dijaga izin yang sama: berkas yang menempel pada
    // periode, dan berkas yang menempel pada satu item check di dalamnya. Daftarnya
    // dibatasi karena id-nya datang dari klien — tanpa saringan ini, action ini dapat
    // dipakai membuang lampiran klaim atau evidence CPAR yang bukan urusannya.
    if (
      !attachment?.claimId ||
      ![MONITORING_PERIOD_ENTITY, MONITORING_CHECK_ENTITY].includes(attachment.entityType)
    ) {
      throw new NotFoundError("Evidence tidak ditemukan.");
    }

    const claim = await loadClaim(attachment.claimId);
    assertCan(actor, "monitoring.evidence.upload", toContext(claim));

    await db.attachment.update({ where: { id: attachmentId }, data: { deletedAt: new Date() } });
    await storage.remove(attachment.path).catch(() => undefined);

    revalidateMonitoring(attachment.claimId);

    return { ok: true, message: "Evidence dihapus." };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Bukti untuk satu item check pada satu periode.
 *
 * Periodenya tidak diminta dari klien bersama item secara terpisah lalu dipercaya:
 * keduanya harus bertemu pada satu baris `MonitoringCheck` yang memang ada, sehingga
 * berkas tidak dapat dilampirkan ke item milik klaim lain dengan menukar salah satu id.
 */
export async function uploadCheckEvidence(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();

    const periodId = String(formData.get("periodId") ?? "");
    const itemId = String(formData.get("itemId") ?? "");
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError("Pilih berkas yang akan diunggah.");
    }

    const check = await db.monitoringCheck.findUnique({
      where: { periodId_itemId: { periodId, itemId } },
      include: {
        item: { select: { title: true } },
        period: { select: { id: true, claimId: true, periodNo: true, status: true } },
      },
    });

    if (!check) throw new NotFoundError("Item check tidak ditemukan pada periode ini.");

    const claim = await loadClaim(check.period.claimId);
    assertCan(actor, "monitoring.evidence.upload", toContext(claim));

    if (check.period.status !== "PENDING") {
      throw new ForbiddenError(
        `Periode ${check.period.periodNo} sudah dinilai, evidence tidak dapat ditambah lagi.`,
        "monitoring.evidence.upload",
      );
    }

    const saved = await saveUpload({
      file,
      folder: claimFolder(claim.claimNo, claim.id),
      entityType: MONITORING_CHECK_ENTITY,
    });

    await db.attachment.create({
      data: {
        entityType: MONITORING_CHECK_ENTITY,
        entityId: check.id,
        claimId: claim.id,
        originalName: saved.originalName,
        caption: check.item.title,
        mimeType: saved.mimeType,
        size: saved.size,
        path: saved.path,
        uploadedById: actor.id,
      },
    });

    revalidateMonitoring(claim.id);

    return { ok: true, message: `${check.item.title} dilampirkan.` };
  } catch (error) {
    return failure(error);
  }
}

// ─────────────────────── Angka hasil produksi & inspeksi ───────────────────────

/**
 * Menambah satu baris angka ke sebuah periode.
 *
 * Satu baris per tanggal pencatatan, bukan satu ringkasan per periode: frekuensinya
 * ditentukan pabrik — harian, per shift, atau per lot — dan portal tidak memaksakan
 * satu di antaranya. Tanggalnya pun tanggal produksi atau inspeksinya, bukan tanggal
 * baris ini dibuat, sehingga angka yang dimasukkan terlambat tetap jatuh pada harinya.
 */
export async function addMonitoringResult(periodId: string, input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireActor();

    const period = await db.monitoringPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, claimId: true, periodNo: true, status: true },
    });

    if (!period) throw new NotFoundError("Periode pemantauan tidak ditemukan.");

    const claim = await loadClaim(period.claimId);
    assertCan(actor, "monitoring.evidence.upload", toContext(claim));

    const parsed = monitoringResultSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Periksa kembali angkanya.",
        fieldErrors: flattenZodErrors(parsed.error),
      };
    }

    // Periode yang sudah dinilai tidak menerima angka baru, dengan alasan yang sama
    // seperti evidence: penilaiannya mengacu pada angka yang ada saat itu.
    if (period.status !== "PENDING") {
      throw new ForbiddenError(
        `Periode ${period.periodNo} sudah dinilai, angkanya tidak dapat diubah lagi.`,
        "monitoring.evidence.upload",
      );
    }

    const { kind, recordedOn, quantity, okCount, ngCount } = parsed.data;
    const note = (parsed.data.note ?? "").trim() || null;

    await db.monitoringResult.create({
      data: {
        periodId: period.id,
        claimId: claim.id,
        kind,
        recordedOn,
        quantity,
        okCount,
        ngCount,
        note,
        recordedById: actor.id,
      },
    });

    revalidateMonitoring(claim.id);

    return { ok: true, message: `Baris ${formatDate(recordedOn)} tersimpan.` };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteMonitoringResult(resultId: string): Promise<ActionResult> {
  try {
    const actor = await requireActor();

    const result = await db.monitoringResult.findUnique({
      where: { id: resultId },
      include: { period: { select: { periodNo: true, status: true } } },
    });

    if (!result) throw new NotFoundError("Baris tidak ditemukan.");

    const claim = await loadClaim(result.claimId);
    assertCan(actor, "monitoring.evidence.upload", toContext(claim));

    if (result.period.status !== "PENDING") {
      throw new ForbiddenError(
        `Periode ${result.period.periodNo} sudah dinilai, angkanya tidak dapat diubah lagi.`,
        "monitoring.evidence.upload",
      );
    }

    // Dihapus lunak, seperti seluruh baris berdata di portal ini: rekap yang pernah
    // dibaca orang tetap dapat ditelusuri, dan angka tidak lenyap tanpa jejak.
    await db.monitoringResult.update({
      where: { id: resultId },
      data: { deletedAt: new Date() },
    });

    revalidateMonitoring(result.claimId);

    return { ok: true, message: "Baris dihapus." };
  } catch (error) {
    return failure(error);
  }
}

// ─────────────────────── Penilaian efektivitas ───────────────────────

/**
 * Item check satu periode beserta jumlah berkasnya.
 *
 * Berkasnya dihitung dengan `findMany`, bukan `groupBy`: penyaring soft delete di
 * `lib/db.ts` hanya ikut pada operasi baca yang terdaftar, dan `groupBy` bukan salah
 * satunya — berkas yang sudah dihapus akan terhitung dan gerbangnya lolos atas bukti
 * yang tidak ada lagi.
 */
async function loadCheckSlots(periodId: string) {
  const checks = await db.monitoringCheck.findMany({
    where: { periodId },
    include: { item: { select: { title: true, order: true } } },
  });

  const files = await db.attachment.findMany({
    where: {
      entityType: MONITORING_CHECK_ENTITY,
      entityId: { in: checks.map((check) => check.id) },
    },
    select: { entityId: true },
  });

  const counted = new Map<string, number>();
  for (const file of files) {
    counted.set(file.entityId, (counted.get(file.entityId) ?? 0) + 1);
  }

  return checks
    .sort((a, b) => a.item.order - b.item.order)
    .map((check) => ({ title: check.item.title, fileCount: counted.get(check.id) ?? 0 }));
}

/**
 * Menilai satu periode.
 *
 * `NOT_EFFECTIVE` berlaku seketika: klaim kembali ke `CPAR_REVISION`, siklus CPAR naik,
 * dan section CPAR dibuka lagi — Action Button B aktif kembali. Periode siklus lama
 * tidak dihapus supaya timeline tetap memperlihatkan percobaan yang gagal.
 */
export async function setEffectiveness(periodId: string, input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireActor();

    const period = await db.monitoringPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, claimId: true, periodNo: true, status: true, cycle: true },
    });

    if (!period) throw new NotFoundError("Periode pemantauan tidak ditemukan.");

    const claim = await loadClaim(period.claimId);
    const context = toContext(claim);

    assertCan(actor, "monitoring.setEffectiveness", context);

    const parsed = effectivenessSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Penilaian belum lengkap.",
        fieldErrors: flattenZodErrors(parsed.error),
      };
    }

    if (period.status !== "PENDING") {
      throw new ValidationError(
        `Periode ${period.periodNo} sudah dinilai sebagai ${period.status}. Penilaian tidak dapat diubah.`,
      );
    }

    const cycle = cycleOf(claim);

    if (period.cycle !== cycle) {
      throw new ValidationError(
        `Periode ini milik siklus ${period.cycle}, sedangkan siklus berjalan adalah ${cycle}.`,
      );
    }

    const { result } = parsed.data;
    const note = (parsed.data.note ?? "").trim() || null;
    const notEffective = result === "NOT_EFFECTIVE";

    if (notEffective) {
      assertTransition(claim.status, "CPAR_REVISION", actor.roles);
    } else {
      // Effective ditahan selama masih ada item check tanpa bukti. Item itulah yang
      // ditetapkan sendiri sebagai ukuran efektivitas saat pemantauan dibuka;
      // menyatakan berhasil tanpa melampirkannya berarti menilai dari ingatan.
      //
      // Not Effective sengaja tidak ditahan: kegagalan tidak perlu dibuktikan dengan
      // berkas yang justru tidak pernah berhasil dikumpulkan, dan menahannya hanya akan
      // mengunci periode yang jelas-jelas gagal.
      const missing = missingCheckEvidence(await loadCheckSlots(period.id));

      if (missing.length > 0) {
        throw new ValidationError(
          `Periode ${period.periodNo} belum dapat dinyatakan Effective. Belum ada bukti untuk: ${missing.join("; ")}.`,
        );
      }
    }

    const requestContext = await readRequestContext();
    const decidedAt = new Date();
    const nextCycle = cycle + 1;

    await db.$transaction(async (tx) => {
      await tx.monitoringPeriod.update({
        where: { id: period.id },
        data: { status: result, note, filledById: actor.id, filledAt: decidedAt },
      });

      if (notEffective) {
        await tx.cpar.update({
          where: { claimId: claim.id },
          data: { cycle: nextCycle, submittedAt: null, approvedAt: null },
        });

        await tx.cparSection.updateMany({
          where: { cparId: claim.cpar?.id },
          data: { lockedAt: null, revisionNote: note },
        });

        await tx.claim.update({ where: { id: claim.id }, data: { status: "CPAR_REVISION" } });
      }

      await writeAuditLog(
        tx,
        {
          actorId: actor.id,
          entityType: "MonitoringPeriod",
          entityId: period.id,
          claimId: claim.id,
          action: "monitoring.setEffectiveness",
          fromStatus: notEffective ? claim.status : null,
          toStatus: notEffective ? "CPAR_REVISION" : null,
          payloadDiff: {
            periodNo: period.periodNo,
            cycle,
            result,
            ...(note ? { comment: note } : {}),
          },
        },
        requestContext,
      );
    });

    const actorSummary = { id: actor.id, name: actor.name, jobTitle: actor.jobTitle };

    if (notEffective) {
      after(async () => {
        await notifyCapaNotEffective(claim.id, actorSummary, period.id, period.periodNo, note);
      });
    }

    revalidateMonitoring(claim.id);

    return {
      ok: true,
      message: notEffective
        ? `Periode ${period.periodNo} Not Effective — CPAR dibuka kembali pada siklus ${nextCycle}.`
        : `Periode ${period.periodNo} dinyatakan Effective.`,
    };
  } catch (error) {
    return failure(error);
  }
}

// ─────────────────────── Improvement Report & penutupan ───────────────────────

export async function submitImprovementReport(
  claimId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const claim = await loadClaim(claimId);
    const context = toContext(claim);

    assertCan(actor, "monitoring.submitReport", context);
    assertTransition(claim.status, "VERIFIED_CLOSED", actor.roles);

    const parsed = improvementReportSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Improvement Report belum lengkap.",
        fieldErrors: flattenZodErrors(parsed.error),
      };
    }

    const cycle = cycleOf(claim);
    const progress = monitoringProgress(claim.monitoring, cycle);
    const blocker = closingBlocker(progress);

    if (blocker) {
      throw new ValidationError(`Klaim belum dapat ditutup. ${blocker}`);
    }

    const { summary } = parsed.data;
    const lessonLearned = (parsed.data.lessonLearned ?? "").trim() || null;

    // Blok A3 yang kosong tidak disimpan sebagai string kosong: pembaca snapshot nanti
    // harus dapat membedakan "tidak diisi" dari "diisi kosong".
    const a3Entries = A3_BLOCKS.map((block) => [block, (parsed.data[block] ?? "").trim()] as const)
      .filter(([, value]) => value.length > 0);
    const a3Content: Prisma.InputJsonValue | undefined =
      a3Entries.length > 0 ? Object.fromEntries(a3Entries) : undefined;

    const requestContext = await readRequestContext();
    const closedAt = new Date();

    await db.$transaction(async (tx) => {
      await tx.improvementReport.create({
        data: {
          claimId,
          cycle,
          summary,
          lessonLearned,
          ...(a3Content ? { a3Content } : {}),
          submittedById: actor.id,
          submittedAt: closedAt,
        },
      });

      await tx.claim.update({
        where: { id: claimId },
        data: { status: "VERIFIED_CLOSED", closedAt },
      });

      await writeAuditLog(
        tx,
        {
          actorId: actor.id,
          entityType: "ImprovementReport",
          entityId: claimId,
          claimId,
          action: "monitoring.submitReport",
          fromStatus: claim.status,
          toStatus: "VERIFIED_CLOSED",
          payloadDiff: {
            cycle,
            periods: progress.total,
            a3Blocks: a3Entries.map(([block]) => block),
          },
        },
        requestContext,
      );
    });

    after(async () => {
      await notifyMonitoringFinished(
        claimId,
        { id: actor.id, name: actor.name, jobTitle: actor.jobTitle },
        cycle,
      );
    });

    revalidateMonitoring(claimId);

    return { ok: true, message: "Klaim ditutup sebagai Verified Closed." };
  } catch (error) {
    return failure(error);
  }
}
