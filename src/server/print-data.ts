import "server-only";

import { forbidden, notFound } from "next/navigation";

import type { DocumentKind } from "@/generated/prisma/enums";
import { ACTION_ITEM_ENTITY } from "@/lib/cpar";
import { db } from "@/lib/db";
import { DOCUMENT_ROUTE } from "@/lib/pdf";
import { CLAIM_CONTEXT_SELECT, canViewClaim, toClaimContext } from "@/lib/permissions";
import { verifyPrintToken } from "@/lib/print-token";
import { readSessionActor } from "@/lib/session";
import { storage } from "@/lib/storage";
import { type ActionPlanInput, itemIds } from "@/schemas/action-plan";

/**
 * Pemuat data bersama untuk halaman /print/*.
 *
 * Dua jalur masuk yang sah:
 *   token — dibawa Puppeteer saat mencetak, berumur dua menit, terikat satu dokumen
 *   sesi  — dipakai manusia yang membuka ?preview=1 untuk memeriksa tata letak (§9)
 */

export async function authorizePrint(kind: DocumentKind, subjectId: string, token: string | null) {
  if (verifyPrintToken(token, DOCUMENT_ROUTE[kind], subjectId)) return;

  const actor = await readSessionActor();
  if (!actor) forbidden();

  /*
   * `subjectId` adalah id klaim untuk Bad News dan Quick Information, dan id CPAR untuk
   * lembar CPAR, monitoring, dan A3 — lihat `printUrl`. Izin selalu dinilai atas
   * **klaim**-nya, jadi id CPAR ditukar lebih dulu ke klaim pemiliknya.
   */
  const claim = await db.claim.findUnique({
    where: { id: subjectId },
    select: CLAIM_CONTEXT_SELECT,
  });

  const subject =
    claim ??
    (await db.cpar
      .findUnique({ where: { id: subjectId }, select: { claimId: true } })
      .then((cpar) =>
        cpar
          ? db.claim.findUnique({ where: { id: cpar.claimId }, select: CLAIM_CONTEXT_SELECT })
          : null,
      ));

  if (!subject) notFound();

  const allowed = canViewClaim(actor, toClaimContext(subject));

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

/**
 * Menerima id CPAR **atau** id klaim.
 *
 * Lembar cetak diminta dari dua arah: Puppeteer yang merender PDF selalu mengirim id
 * CPAR, sementara tautan "Print CPAR" yang sudah beredar — di portal, di email, di
 * bookmark — mengirim id klaim, karena dulu memang itu kuncinya. Keduanya dilayani di
 * sini, sekali, alih-alih ditambal di tiap halaman cetak.
 *
 * Klaim dengan lebih dari satu CPAR mengambil yang pertama terbit: tautan lama tidak
 * menyebut CPAR yang mana, dan satu-satunya yang pernah dimaksudkannya adalah CPAR yang
 * sudah ada saat tautan itu dibuat.
 */
async function resolveCparId(id: string): Promise<string> {
  const direct = await db.cpar.findUnique({ where: { id }, select: { id: true } });
  if (direct) return direct.id;

  const first = await db.cpar.findFirst({
    where: { claimId: id },
    orderBy: { issuedAt: "asc" },
    select: { id: true },
  });

  if (!first) notFound();

  return first.id;
}

export async function loadCparForPrint(idOrClaimId: string) {
  const cparId = await resolveCparId(idOrClaimId);

  const cpar = await db.cpar.findUnique({
    where: { id: cparId },
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
      userHeadVerifier: { select: { name: true, jobTitle: true } },
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
export async function loadMonitoringForPrint(idOrClaimId: string) {
  const cparId = await resolveCparId(idOrClaimId);

  const cpar = await db.cpar.findUnique({
    where: { id: cparId },
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

  const [periods, checkItems, report] = await Promise.all([
    db.monitoringPeriod.findMany({
      where: { cparId, cycle: cpar.cycle },
      include: { filledBy: { select: { name: true, jobTitle: true } } },
      orderBy: { periodNo: "asc" },
    }),
    db.monitoringCheckItem.findMany({
      where: { cparId, cycle: cpar.cycle },
      orderBy: { order: "asc" },
    }),
    db.improvementReport.findFirst({
      where: { cparId, cycle: cpar.cycle },
      include: { submittedBy: { select: { name: true, jobTitle: true } } },
      orderBy: { submittedAt: "desc" },
    }),
  ]);

  // Angka hasil diambil lewat periode siklus ini, bukan lewat claimId saja: siklus lama
  // punya angkanya sendiri, dan menggabungkannya akan membuat lembar cetak menyatakan
  // perbaikan yang sebenarnya milik percobaan yang sudah gagal.
  const periodIds = periods.map((period) => period.id);

  const [results, checks] = await Promise.all([
    db.monitoringResult.findMany({
      where: { periodId: { in: periodIds } },
      orderBy: [{ recordedOn: "asc" }, { createdAt: "asc" }],
    }),
    db.monitoringCheck.findMany({
      where: { periodId: { in: periodIds } },
      include: { judgedBy: { select: { name: true } } },
    }),
  ]);

  return { cpar, claim: cpar.claim, periods, checkItems, checks, results, report };
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

/**
 * Nama PIC dan jumlah evidence untuk kedua section yang berisi daftar tindakan.
 *
 * Keduanya hidup di luar kolom Json: PIC disimpan sebagai id, dan evidence sebagai
 * lampiran yang menempel pada penanda baris. Evidence disaring dengan claimId juga,
 * sehingga penanda baris yang keliru tidak dapat menghitung berkas milik klaim lain.
 *
 * Kedua section ditanyakan sekaligus — penandanya UUID, jadi hasilnya tidak mungkin
 * tertukar, dan memisahkannya hanya menggandakan perjalanan ke basis data.
 */
export async function loadActionPlanContext(
  claimId: string,
  values: readonly ActionPlanInput[],
): Promise<{
  picNames: Record<string, string>;
  evidenceCounts: Record<string, number>;
}> {
  const items = values.flatMap((value) => value.items);
  const ids = values.flatMap((value) => [...itemIds(value)]);
  const picIds = [...new Set(items.map((item) => item.picId))];

  if (ids.length === 0 && picIds.length === 0) {
    return { picNames: {}, evidenceCounts: {} };
  }

  const [people, files] = await Promise.all([
    db.user.findMany({ where: { id: { in: picIds } }, select: { id: true, name: true } }),
    ids.length > 0
      ? db.attachment.groupBy({
          by: ["entityId"],
          where: { entityType: ACTION_ITEM_ENTITY, entityId: { in: ids }, claimId },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  return {
    picNames: Object.fromEntries(people.map((person) => [person.id, person.name])),
    evidenceCounts: Object.fromEntries(files.map((row) => [row.entityId, row._count._all])),
  };
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
