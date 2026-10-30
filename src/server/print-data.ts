import "server-only";

import { forbidden, notFound } from "next/navigation";

import type { DocumentKind } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { DOCUMENT_ROUTE } from "@/lib/pdf";
import { canViewClaim } from "@/lib/permissions";
import { verifyPrintToken } from "@/lib/print-token";
import { readSessionActor } from "@/lib/session";
import { storage } from "@/lib/storage";

/**
 * Pemuat data bersama untuk halaman /print/*.
 *
 * Dua jalur masuk yang sah:
 *   token — dibawa Puppeteer saat mencetak, berumur dua menit, terikat satu dokumen
 *   sesi  — dipakai manusia yang membuka ?preview=1 untuk memeriksa tata letak (§9)
 */

export async function authorizePrint(kind: DocumentKind, claimId: string, token: string | null) {
  if (verifyPrintToken(token, DOCUMENT_ROUTE[kind], claimId)) return;

  const actor = await readSessionActor();
  if (!actor) forbidden();

  const claim = await db.claim.findUnique({
    where: { id: claimId },
    select: {
      status: true,
      createdById: true,
      cpar: { select: { responsibleDeptId: true, cftMembers: { select: { departmentId: true } } } },
    },
  });

  if (!claim) notFound();

  const allowed = canViewClaim(actor, {
    status: claim.status,
    createdById: claim.createdById,
    cpar: claim.cpar
      ? {
          responsibleDeptId: claim.cpar.responsibleDeptId,
          cftMemberDeptIds: claim.cpar.cftMembers.map((member) => member.departmentId),
        }
      : null,
  });

  if (!allowed) forbidden();
}

export async function loadClaimForPrint(claimId: string) {
  const claim = await db.claim.findUnique({
    where: { id: claimId },
    include: {
      parts: { orderBy: { side: "asc" } },
      productCategory: true,
      ncDetail: true,
      customer: true,
      createdBy: { select: { name: true, jobTitle: true } },
      reviewedBy: { select: { name: true, jobTitle: true } },
    },
  });

  if (!claim) notFound();

  return claim;
}

export async function loadCparForPrint(claimId: string) {
  const cpar = await db.cpar.findUnique({
    where: { claimId },
    include: {
      claim: {
        include: {
          productCategory: true,
          ncDetail: true,
          customer: true,
          createdBy: { select: { name: true, jobTitle: true } },
        },
      },
      responsibleDept: { select: { code: true, name: true } },
      cftMembers: { include: { department: { select: { code: true, name: true } } } },
      initialDocuments: { include: { initialDocument: { select: { name: true } } } },
      sections: { include: { filledBy: { select: { name: true, jobTitle: true } } } },
      verifications: {
        include: { verifier: { select: { name: true, jobTitle: true } } },
        orderBy: { decidedAt: "asc" },
      },
    },
  });

  if (!cpar) notFound();

  return cpar;
}

/**
 * Data pemantauan satu siklus, untuk lembar MONITORING dan A3.
 *
 * Siklus yang diambil adalah siklus CPAR saat ini. Periode siklus sebelumnya tidak ikut
 * dicetak: lembar ini menggambarkan percobaan yang berhasil, sedangkan percobaan yang
 * gagal terbaca di timeline klaim dan di PDF siklus itu sendiri.
 */
export async function loadMonitoringForPrint(claimId: string) {
  const cpar = await db.cpar.findUnique({
    where: { claimId },
    include: {
      claim: {
        include: {
          ncDetail: true,
          customer: true,
          createdBy: { select: { name: true, jobTitle: true } },
        },
      },
      responsibleDept: { select: { code: true, name: true } },
    },
  });

  if (!cpar) notFound();

  const [periods, report] = await Promise.all([
    db.monitoringPeriod.findMany({
      where: { claimId, cycle: cpar.cycle },
      include: { filledBy: { select: { name: true, jobTitle: true } } },
      orderBy: { periodNo: "asc" },
    }),
    db.improvementReport.findFirst({
      where: { claimId, cycle: cpar.cycle },
      include: { submittedBy: { select: { name: true, jobTitle: true } } },
      orderBy: { submittedAt: "desc" },
    }),
  ]);

  return { cpar, claim: cpar.claim, periods, report };
}

/**
 * Blok A3 dibaca dari kolom Json, jadi bentuknya diperiksa di sini.
 *
 * Kolom itu diisi versi aplikasi yang bisa saja berbeda dari yang sedang mencetak;
 * nilai yang bukan string dilewati, bukan dicetak sebagai "[object Object]".
 */
export function readA3Content(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};

  const result: Record<string, string> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && entry.trim().length > 0) result[key] = entry;
  }

  return result;
}

/**
 * Foto dibaca dari penyimpanan dan ditanam sebagai data URI.
 *
 * Puppeteer membuka halaman cetak tanpa cookie sesi, jadi ia tidak akan bisa mengambil
 * /api/files/* yang dijaga izin. Menanam gambarnya langsung menghindari pelonggaran
 * izin route itu hanya demi pencetakan.
 */
export async function photosForParts(partIds: readonly string[]) {
  if (partIds.length === 0) return new Map<string, { id: string; src: string; caption: string | null }[]>();

  const attachments = await db.attachment.findMany({
    where: { entityType: "ClaimPart", entityId: { in: [...partIds] }, mimeType: { startsWith: "image/" } },
    orderBy: { createdAt: "asc" },
  });

  const byPart = new Map<string, { id: string; src: string; caption: string | null }[]>();

  for (const attachment of attachments) {
    let src: string;

    try {
      const data = await storage.read(attachment.path);
      src = `data:${attachment.mimeType};base64,${data.toString("base64")}`;
    } catch {
      // Berkas hilang dari penyimpanan tidak boleh menggagalkan seluruh dokumen;
      // lembarnya tetap dicetak dengan slot foto yang kosong.
      continue;
    }

    const list = byPart.get(attachment.entityId) ?? [];
    list.push({ id: attachment.id, src, caption: attachment.caption });
    byPart.set(attachment.entityId, list);
  }

  return byPart;
}

export const TYPE_LABEL: Record<string, string> = {
  OFFICIAL: "Official",
  NON_OFFICIAL: "Non-Official",
  INFORMATION_ONLY: "Information Only",
};

export const SHIFT_LABEL: Record<string, string> = { MORNING: "Morning", NIGHT: "Night" };

export const FAILURE_PLACE_LABEL: Record<string, string> = {
  REGULAR: "Regular",
  DOMESTIC: "Domestic",
  EXPORT: "Export",
  SERVICE_PART: "Service Part",
};

export const ORIGIN_LABEL: Record<string, string> = {
  NID: "NID",
  PASSTHROUGH: "Passthrough",
  VENDOR_SUBCON: "Vendor / Sub-Contractor",
};

export const OCCURRENCE_LABEL: Record<string, string> = {
  FIRST_TIME: "First Time",
  SECOND_TIME: "Second Time",
  THIRD_OR_MORE: "Third or More",
};
