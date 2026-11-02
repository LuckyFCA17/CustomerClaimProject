import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import {
  EXPORT_COLUMNS,
  EXPORT_ROW_MAX,
  type ExportableClaim,
  describeFilter,
  exportFileName,
  toExportRow,
} from "@/lib/claim-export";
import { claimFilterWhere, claimOrderBy, parseClaimQuery } from "@/lib/claim-filters";
import { db } from "@/lib/db";
import { can, visibleClaimsWhere } from "@/lib/permissions";
import { readSessionActor } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Mengunduh daftar klaim yang sedang tersaring sebagai .xlsx.
 *
 * Penyaringnya dibaca dari query string yang sama dengan halaman daftar, sehingga
 * berkasnya berisi persis apa yang baru saja dilihat orangnya — tidak ada penyaring
 * kedua yang harus diisi ulang, dan tidak ada tabel yang isinya ternyata berbeda.
 *
 * Aturan keterlihatan dipasang lebih dulu dan tidak dapat dilebarkan lewat alamat:
 * penyaring hanya mempersempit apa yang sudah boleh dilihat orangnya.
 */
export async function GET(request: Request) {
  const actor = await readSessionActor();
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });

  if (!can(actor, "claim.export")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const query = parseClaimQuery(params);
  const now = new Date();

  const rows = await db.claim.findMany({
    where: { AND: [visibleClaimsWhere(actor), claimFilterWhere(query)] },
    orderBy: claimOrderBy(query.sort),
    take: EXPORT_ROW_MAX,
    select: {
      claimNo: true,
      status: true,
      type: true,
      dateOfOccurrence: true,
      dateOfReceived: true,
      problemOrigin: true,
      occurrence: true,
      partName: true,
      internalPartNo: true,
      customerPartNo: true,
      lotNo: true,
      kanbanNo: true,
      qualityProblem: true,
      createdAt: true,
      submittedAt: true,
      publishedAt: true,
      customer: { select: { name: true } },
      ncDetail: { select: { name: true } },
      productCategory: { select: { name: true } },
      createdBy: { select: { name: true } },
      cpar: {
        select: {
          cparNo: true,
          cycle: true,
          dueDate: true,
          submittedAt: true,
          approvedAt: true,
          responsibleDept: { select: { name: true } },
        },
      },
    },
  });

  const claims: ExportableClaim[] = rows.map((row) => ({
    claimNo: row.claimNo,
    status: row.status,
    type: row.type,
    dateOfOccurrence: row.dateOfOccurrence,
    dateOfReceived: row.dateOfReceived,
    problemOrigin: row.problemOrigin,
    occurrence: row.occurrence,
    partName: row.partName,
    internalPartNo: row.internalPartNo,
    customerPartNo: row.customerPartNo,
    lotNo: row.lotNo,
    kanbanNo: row.kanbanNo,
    qualityProblem: row.qualityProblem,
    customerName: row.customer?.name ?? null,
    ncDetail: row.ncDetail?.name ?? null,
    productCategory: row.productCategory?.name ?? null,
    createdByName: row.createdBy.name,
    createdAt: row.createdAt,
    submittedAt: row.submittedAt,
    publishedAt: row.publishedAt,
    cparNo: row.cpar?.cparNo ?? null,
    responsibleDept: row.cpar?.responsibleDept.name ?? null,
    cparCycle: row.cpar?.cycle ?? null,
    cparDueDate: row.cpar?.dueDate ?? null,
    cparSubmittedAt: row.cpar?.submittedAt ?? null,
    cparApprovedAt: row.cpar?.approvedAt ?? null,
  }));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NCC Portal";
  workbook.created = now;

  const sheet = workbook.addWorksheet("Claims", {
    views: [{ state: "frozen", ySplit: 3 }],
  });

  // Dua baris keterangan sebelum tabelnya: berkas ekspor berpindah tangan, dan
  // penerimanya tidak pernah melihat layar yang menghasilkannya.
  sheet.addRow([`NCC Portal — daftar klaim per ${now.toLocaleString("id-ID")}`]);
  sheet.addRow([describeFilter(query)]);
  sheet.getRow(1).font = { bold: true, size: 12 };
  sheet.getRow(2).font = { size: 10, color: { argb: "FF6B7280" } };

  const header = sheet.addRow(EXPORT_COLUMNS.map((column) => column.header));
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F5F7" } };

  sheet.columns = EXPORT_COLUMNS.map((column) => ({ width: column.width }));

  for (const claim of claims) sheet.addRow(toExportRow(claim));

  // Tanggal diformat di kolomnya, bukan diubah menjadi teks: yang tersimpan tetap
  // tanggal, sehingga tetap dapat diurutkan dan dihitung selisihnya di Excel.
  EXPORT_COLUMNS.forEach((column, index) => {
    const sample = claims.find((claim) => column.value(claim) instanceof Date);
    if (!sample) return;

    sheet.getColumn(index + 1).numFmt = column.header.startsWith("Tanggal")
      ? "dd mmm yyyy"
      : "dd mmm yyyy hh:mm";
  });

  sheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3 + claims.length, column: EXPORT_COLUMNS.length },
  };

  if (claims.length === EXPORT_ROW_MAX) {
    sheet.addRow([]);
    sheet.addRow([
      `Terpotong pada ${EXPORT_ROW_MAX} baris. Persempit penyaringnya untuk mendapatkan sisanya.`,
    ]);
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${exportFileName(query, now)}"`,
      "cache-control": "no-store",
    },
  });
}
