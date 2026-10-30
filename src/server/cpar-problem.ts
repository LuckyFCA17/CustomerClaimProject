import "server-only";

import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { storage } from "@/lib/storage";
import {
  FAILURE_PLACE_LABEL,
  OCCURRENCE_LABEL,
  ORIGIN_LABEL,
  SHIFT_LABEL,
  TYPE_LABEL,
} from "@/server/print-data";

/**
 * Isi section 1 CPAR — Problem description.
 *
 * Section ini tidak diketik ulang. Seluruh keterangannya sudah dimasukkan QA pada
 * Issue Customer Claim Information, dan klaim tidak dapat diubah lagi setelah terbit,
 * jadi menyalinnya ke kotak teks hanya menciptakan salinan kedua yang bisa berbeda
 * dari aslinya. Yang dibaca di sini adalah klaimnya langsung.
 */

export interface ProblemField {
  readonly label: string;
  readonly value: string | null;
}

export interface ProblemPhoto {
  readonly id: string;
  readonly url: string;
  readonly caption: string | null;
}

export interface ProblemPart {
  readonly side: "STANDARD" | "ACTUAL";
  readonly title: string;
  readonly partName: string | null;
  readonly nidPartNo: string | null;
  readonly qty: string | null;
  readonly dimensionItem: string | null;
  readonly appearanceItem: string | null;
  readonly photos: readonly ProblemPhoto[];
}

export interface ProblemDescription {
  readonly claimId: string;
  readonly claimNo: string | null;
  readonly fields: readonly ProblemField[];
  readonly qualityProblem: string;
  readonly abnormalSource: string | null;
  readonly parts: readonly ProblemPart[];
}

const PROBLEM_ORIGIN_LABEL: Record<string, string> = {
  INTERNAL: "Internal — tertahan di NID",
  EXTERNAL: "External — sudah sampai pelanggan",
};

function text(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();

  return trimmed.length > 0 ? trimmed : null;
}

/** Tanggal produksi pada form klaim terbagi dua: injection dan assembly. */
function productionDate(injection: Date | null, assembly: Date | null): string | null {
  const parts = [
    injection ? `Injection ${formatDate(injection)}` : null,
    assembly ? `Assembly ${formatDate(assembly)}` : null,
  ].filter((entry): entry is string => entry !== null);

  return parts.length > 0 ? parts.join(" · ") : null;
}

export interface LoadProblemOptions {
  /**
   * Menanam foto sebagai data URI, bukan tautan /api/files.
   *
   * Puppeteer membuka halaman cetak tanpa cookie sesi, jadi ia tidak akan bisa
   * mengambil berkas yang dijaga izin — menanamnya langsung menghindari pelonggaran
   * izin route itu hanya demi pencetakan.
   */
  readonly embedPhotos?: boolean;
}

export async function loadProblemDescription(
  claimId: string,
  options: LoadProblemOptions = {},
): Promise<ProblemDescription> {
  const claim = await db.claim.findUnique({
    where: { id: claimId },
    include: {
      productCategory: { select: { name: true } },
      ncDetail: { select: { name: true } },
      customer: { select: { name: true } },
      parts: { orderBy: { side: "asc" } },
    },
  });

  if (!claim) notFound();

  const attachments = await db.attachment.findMany({
    where: {
      entityType: "ClaimPart",
      entityId: { in: claim.parts.map((part) => part.id) },
      mimeType: { startsWith: "image/" },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, entityId: true, path: true, caption: true, mimeType: true },
  });

  const photosByPart = new Map<string, ProblemPhoto[]>();
  for (const file of attachments) {
    let url = `/api/files/${file.path}`;

    if (options.embedPhotos) {
      try {
        const data = await storage.read(file.path);
        url = `data:${file.mimeType};base64,${data.toString("base64")}`;
      } catch {
        // Berkas yang hilang dari penyimpanan tidak boleh menggagalkan seluruh
        // dokumen; slot fotonya dilewati dan lembar tetap tercetak.
        continue;
      }
    }

    const list = photosByPart.get(file.entityId) ?? [];
    list.push({ id: file.id, url, caption: file.caption });
    photosByPart.set(file.entityId, list);
  }

  const sides: readonly { side: "STANDARD" | "ACTUAL"; title: string }[] = [
    { side: "STANDARD", title: "Standard" },
    { side: "ACTUAL", title: "Actual" },
  ];

  return {
    claimId: claim.id,
    claimNo: claim.claimNo,
    fields: [
      { label: "Kategori klaim", value: claim.type ? (TYPE_LABEL[claim.type] ?? claim.type) : null },
      { label: "Product category", value: claim.productCategory?.name ?? null },
      {
        label: "Occurrence",
        value: claim.occurrence ? (OCCURRENCE_LABEL[claim.occurrence] ?? claim.occurrence) : null,
      },
      {
        label: "Problem",
        value: claim.problemOrigin ? PROBLEM_ORIGIN_LABEL[claim.problemOrigin] : null,
      },
      { label: "Customer part no.", value: text(claim.customerPartNo) },
      { label: "Internal part no.", value: text(claim.internalPartNo) },
      { label: "Part name", value: text(claim.partName) },
      { label: "Kanban no.", value: text(claim.kanbanNo) },
      { label: "Production date", value: productionDate(claim.injectionDate, claim.assemblyDate) },
      { label: "Delivery date", value: claim.deliveryDate ? formatDate(claim.deliveryDate) : null },
      { label: "Customer", value: claim.customer?.name ?? null },
      { label: "Non-conformance detail", value: claim.ncDetail?.name ?? null },
      {
        label: "Failure place",
        value: [
          text(claim.failurePlace),
          claim.failurePlaceType ? FAILURE_PLACE_LABEL[claim.failurePlaceType] : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      },
      {
        label: "Production place",
        value: [
          claim.originPlantType ? ORIGIN_LABEL[claim.originPlantType] : null,
          text(claim.originPlantDetail),
        ]
          .filter(Boolean)
          .join(" · ") || null,
      },
      {
        label: "Date of occurrence",
        value: claim.dateOfOccurrence
          ? [
              formatDate(claim.dateOfOccurrence),
              claim.shiftOfOccurrence ? SHIFT_LABEL[claim.shiftOfOccurrence] : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : null,
      },
      {
        label: "Date of received",
        value: claim.dateOfReceived
          ? [
              formatDate(claim.dateOfReceived),
              claim.shiftOfReceived ? SHIFT_LABEL[claim.shiftOfReceived] : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : null,
      },
      { label: "Lot no.", value: text(claim.lotNo) },
      { label: "Suspected process line", value: text(claim.suspectedProcessLine) },
    ],
    qualityProblem: claim.qualityProblem,
    abnormalSource: text(claim.abnormalSource),
    parts: sides.map(({ side, title }) => {
      const part = claim.parts.find((entry) => entry.side === side);

      return {
        side,
        title,
        partName: text(part?.partName),
        nidPartNo: text(part?.nidPartNo),
        qty: part ? `${part.qty.toString()} ${part.qtyUnit.toLowerCase()}` : null,
        dimensionItem: text(part?.dimensionItem),
        appearanceItem: text(part?.appearanceItem),
        photos: part ? (photosByPart.get(part.id) ?? []) : [],
      };
    }),
  };
}
