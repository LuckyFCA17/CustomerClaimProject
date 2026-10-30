import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { DocumentKind } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { DOCUMENT_TITLE, renderPdf, storePdf } from "@/lib/pdf";
import { claimFolder } from "@/lib/storage";

/**
 * Pencetakan dan penyimpanan dokumen klaim (§9, PLAN D6).
 *
 * Setiap PDF disimpan bersama snapshot data klaim saat itu. PDF yang dibuat bulan lalu
 * karena itu tetap menggambarkan keadaan bulan lalu, walau klaimnya sudah berubah —
 * dokumen yang pernah dikirim ke pelanggan tidak boleh berubah diam-diam.
 */

export interface GeneratedDoc {
  readonly kind: DocumentKind;
  readonly path: string;
  readonly filename: string;
}

async function snapshotFor(claimId: string) {
  const claim = await db.claim.findUniqueOrThrow({
    where: { id: claimId },
    include: {
      parts: { orderBy: { side: "asc" } },
      productCategory: { select: { code: true, name: true } },
      ncDetail: { select: { code: true, name: true } },
      customer: { select: { code: true, name: true } },
      createdBy: { select: { name: true, jobTitle: true } },
      reviewedBy: { select: { name: true, jobTitle: true } },
    },
  });

  // Melewati JSON sekali membuang tipe yang tidak dikenal Postgres JSONB —
  // Date menjadi ISO string dan Decimal menjadi string, keduanya stabil untuk arsip.
  return JSON.parse(
    JSON.stringify(claim, (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  ) as Prisma.InputJsonValue;
}

/**
 * Mencetak satu dokumen dan mencatatnya.
 *
 * Versi dinaikkan tiap pencetakan ulang, bukan menimpa yang lama: kriteria penerimaan #6
 * menuntut PDF lama tetap dapat ditelusuri, dan nomor versi itulah jejaknya.
 */
export async function generateDocument(
  claimId: string,
  kind: DocumentKind,
  options: { actorId?: string | null; draft?: boolean } = {},
): Promise<GeneratedDoc> {
  const claim = await db.claim.findUniqueOrThrow({
    where: { id: claimId },
    select: { claimNo: true, status: true },
  });

  const claimNo = claim.claimNo ?? `DRAFT-${claimId.slice(-6).toUpperCase()}`;

  const latest = await db.generatedDocument.findFirst({
    where: { claimId, kind, cycle: 1 },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const version = (latest?.version ?? 0) + 1;
  const isDraft = options.draft ?? claim.status === "DRAFT";

  const pdf = await renderPdf({ kind, claimId, draft: isDraft });
  const stored = await storePdf(kind, claimFolder(claim.claimNo, claimId), claimNo, pdf, version);

  await db.generatedDocument.create({
    data: {
      claimId,
      kind,
      version,
      cycle: 1,
      path: stored.path,
      snapshot: await snapshotFor(claimId),
      isDraft,
      generatedById: options.actorId ?? null,
    },
  });

  return { kind, path: stored.path, filename: stored.filename };
}

/**
 * PDF CPAR (§9).
 *
 * Dicetak per siklus, bukan per klaim: satu REVISE menghasilkan lembar yang berbeda
 * isinya, dan keduanya harus tetap terbaca. Watermark DRAFT menempel selama CPAR belum
 * disetujui seluruh verifier (§6 Modul 3) — lembar yang beredar sebelum approval tidak
 * boleh tertukar dengan yang sudah sah.
 *
 * Mengembalikan null bila pencetakan gagal: CPAR sudah disetujui dan statusnya tidak
 * boleh dibatalkan hanya karena Chromium tidak tersedia, seperti di Termux.
 */
export async function generateCparDocument(
  claimId: string,
  actorId: string | null,
): Promise<GeneratedDoc | null> {
  try {
    const cpar = await db.cpar.findUniqueOrThrow({
      where: { claimId },
      select: { cycle: true, approvedAt: true },
    });

    const claim = await db.claim.findUniqueOrThrow({
      where: { id: claimId },
      select: { claimNo: true },
    });

    const claimNo = claim.claimNo ?? `DRAFT-${claimId.slice(-6).toUpperCase()}`;

    const latest = await db.generatedDocument.findFirst({
      where: { claimId, kind: "CPAR", cycle: cpar.cycle },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    const version = (latest?.version ?? 0) + 1;
    const isDraft = cpar.approvedAt === null;

    const pdf = await renderPdf({ kind: "CPAR", claimId, draft: isDraft });
    const stored = await storePdf(
      "CPAR",
      claimFolder(claim.claimNo, claimId),
      `${claimNo}_c${cpar.cycle}`,
      pdf,
      version,
    );

    await db.generatedDocument.create({
      data: {
        claimId,
        kind: "CPAR",
        version,
        cycle: cpar.cycle,
        path: stored.path,
        snapshot: await cparSnapshot(claimId),
        isDraft,
        generatedById: actorId,
      },
    });

    return { kind: "CPAR", path: stored.path, filename: stored.filename };
  } catch (error) {
    console.error(
      `Gagal mencetak ${DOCUMENT_TITLE.CPAR} untuk klaim ${claimId}:`,
      error instanceof Error ? error.message : error,
    );

    return null;
  }
}

/**
 * Dokumen penutup klaim (§9): lembar pemantauan dan A3 Improvement Report.
 *
 * Keduanya dicetak per siklus dan tidak pernah berwatermark DRAFT — keduanya hanya ada
 * setelah klaim ditutup. Kegagalan satu dokumen tidak menggagalkan yang lain, dan tidak
 * pernah membatalkan penutupan klaim yang sudah terjadi.
 */
export async function generateClosingDocuments(
  claimId: string,
  actorId: string | null,
): Promise<GeneratedDoc[]> {
  const kinds: DocumentKind[] = ["MONITORING", "A3"];
  const results: GeneratedDoc[] = [];

  for (const kind of kinds) {
    try {
      results.push(await generateCycleDocument(claimId, kind, actorId));
    } catch (error) {
      console.error(
        `Gagal mencetak ${DOCUMENT_TITLE[kind]} untuk klaim ${claimId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return results;
}

/** Dokumen yang diversi per siklus CPAR, bukan per klaim. */
async function generateCycleDocument(
  claimId: string,
  kind: DocumentKind,
  actorId: string | null,
): Promise<GeneratedDoc> {
  const cpar = await db.cpar.findUniqueOrThrow({
    where: { claimId },
    select: { cycle: true },
  });

  const claim = await db.claim.findUniqueOrThrow({
    where: { id: claimId },
    select: { claimNo: true },
  });

  const claimNo = claim.claimNo ?? `DRAFT-${claimId.slice(-6).toUpperCase()}`;

  const latest = await db.generatedDocument.findFirst({
    where: { claimId, kind, cycle: cpar.cycle },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const version = (latest?.version ?? 0) + 1;

  const pdf = await renderPdf({ kind, claimId, draft: false });
  const stored = await storePdf(
    kind,
    claimFolder(claim.claimNo, claimId),
    `${claimNo}_c${cpar.cycle}`,
    pdf,
    version,
  );

  await db.generatedDocument.create({
    data: {
      claimId,
      kind,
      version,
      cycle: cpar.cycle,
      path: stored.path,
      snapshot: await monitoringSnapshot(claimId, cpar.cycle),
      isDraft: false,
      generatedById: actorId,
    },
  });

  return { kind, path: stored.path, filename: stored.filename };
}

async function monitoringSnapshot(claimId: string, cycle: number): Promise<Prisma.InputJsonValue> {
  const [periods, report] = await Promise.all([
    db.monitoringPeriod.findMany({
      where: { claimId, cycle },
      include: { filledBy: { select: { name: true, jobTitle: true } } },
      orderBy: { periodNo: "asc" },
    }),
    db.improvementReport.findFirst({
      where: { claimId, cycle },
      include: { submittedBy: { select: { name: true, jobTitle: true } } },
      orderBy: { submittedAt: "desc" },
    }),
  ]);

  return JSON.parse(
    JSON.stringify({ cycle, periods, report }, (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  ) as Prisma.InputJsonValue;
}

async function cparSnapshot(claimId: string): Promise<Prisma.InputJsonValue> {
  const cpar = await db.cpar.findUniqueOrThrow({
    where: { claimId },
    include: {
      responsibleDept: { select: { code: true, name: true } },
      cftMembers: { include: { department: { select: { code: true, name: true } } } },
      sections: { include: { filledBy: { select: { name: true, jobTitle: true } } } },
      verifications: { include: { verifier: { select: { name: true, jobTitle: true } } } },
    },
  });

  return JSON.parse(
    JSON.stringify(cpar, (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  ) as Prisma.InputJsonValue;
}

/**
 * Dua dokumen yang menyertai setiap klaim (§6 Modul 1 butir 3).
 *
 * Kegagalan pencetakan tidak dilempar ke pemanggil: klaim sudah berpindah status dan
 * tidak boleh dibatalkan hanya karena Chromium gagal start. Dokumen yang gagal dapat
 * dicetak ulang dari halaman detail.
 */
export async function generateClaimDocuments(
  claimId: string,
  actorId: string | null,
): Promise<GeneratedDoc[]> {
  const kinds: DocumentKind[] = ["BAD_NEWS", "QUICK_INFO"];
  const results: GeneratedDoc[] = [];

  for (const kind of kinds) {
    try {
      results.push(await generateDocument(claimId, kind, { actorId }));
    } catch (error) {
      console.error(
        `Gagal mencetak ${DOCUMENT_TITLE[kind]} untuk klaim ${claimId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return results;
}
