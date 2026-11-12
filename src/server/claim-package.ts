import { DOCUMENT_TITLE } from "@/lib/pdf";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { ACTION_PLAN_SECTIONS, SECTION_LABEL } from "@/lib/cpar";
import { readActionPlan } from "@/schemas/action-plan";
import { safeSegment, uniqueName, type ZipEntry } from "@/lib/zip";
import { storage } from "@/lib/storage";

/**
 * Paket klaim — seluruh lembar cetak dan evidence satu klaim dalam satu arsip.
 *
 * Dipakai saat klaim harus dikirim keluar portal: ke pelanggan, ke auditor, atau ke map
 * mutu yang disimpan terpisah. Sebelum ini, satu-satunya cara adalah membuka tiap berkas
 * satu per satu dan menyimpannya sendiri — pekerjaan yang pada klaim berisi dua puluh
 * lampiran selalu menyisakan satu yang terlewat, tanpa ada yang menyadarinya.
 *
 * Dua hal yang dijaga di sini, dan keduanya berasal dari sifat paket yang dikirim keluar:
 *
 *   · **Dokumen yang belum pernah dibuat tidak diam-diam hilang.** PDF portal ini adalah
 *     snapshot yang lahir pada peristiwa tertentu — Bad News saat terbit, CPAR saat
 *     disetujui. Klaim yang belum sampai ke sana memang belum punya berkasnya, dan paket
 *     yang menghilangkannya tanpa kata akan terbaca sebagai paket lengkap.
 *   · **Isinya tertulis.** `ISI-PAKET.txt` menyebut apa yang ada, apa yang tidak dipilih,
 *     dan apa yang belum pernah dibuat — sehingga penerimanya tidak perlu menebak apakah
 *     yang ia terima utuh.
 */

/** Satu berkas yang dapat dipilih masuk paket. */
export interface PackageItem {
  readonly id: string;
  /** Nama yang terbaca orang — judul yang diketik, atau nama berkas aslinya. */
  readonly label: string;
  readonly originalName: string;
  readonly sizeBytes: number;
  readonly uploadedByName: string;
  readonly uploadedAt: Date;
}

export interface PackageGroup {
  /** Nomor urut folder, supaya urutan di arsip sama dengan urutan alur kerjanya. */
  readonly order: number;
  readonly folder: string;
  readonly items: readonly PackageItem[];
}

export interface PackageDocument {
  readonly id: string;
  readonly title: string;
  readonly fileName: string;
  readonly path: string;
  readonly isDraft: boolean;
  readonly generatedAt: Date;
}

export interface PackageContents {
  readonly claimId: string;
  readonly claimNo: string | null;
  readonly folderName: string;
  readonly documents: readonly PackageDocument[];
  /** Lembar yang belum pernah dibuat — disebut di manifes, bukan dihilangkan diam-diam. */
  readonly missingDocuments: readonly string[];
  readonly groups: readonly PackageGroup[];
  readonly totalBytes: number;
}

const GROUPS: readonly { entityType: string; order: number; folder: string }[] = [
  { entityType: "ClaimPart", order: 2, folder: "Foto part" },
  { entityType: "ClaimIgnoration", order: 3, folder: "Pembatalan klaim" },
  { entityType: "CparInitialDocument", order: 4, folder: "CPAR - Initial Document Request" },
  { entityType: "CparActionItem", order: 5, folder: "CPAR - Evidence tindakan" },
  { entityType: "Cpar", order: 6, folder: "CPAR - Other Supporting Evidence" },
  { entityType: "MonitoringCheck", order: 7, folder: "Monitoring - Item yang dipantau" },
  { entityType: "MonitoringPeriod", order: 8, folder: "Monitoring - Evidence periode" },
];

const DOCUMENT_FOLDER = "01 Dokumen cetak";

/** Lembar yang seharusnya ada pada klaim yang sudah berjalan sejauh ini. */
const EXPECTED_DOCUMENTS = ["BAD_NEWS", "QUICK_INFO", "CPAR", "MONITORING", "A3"] as const;

function folderName(claimNo: string | null, claimId: string): string {
  return safeSegment(claimNo ? claimNo.replace(/\//g, "-") : `DRAFT-${claimId}`, "klaim");
}

/**
 * Isi paket yang tersedia, untuk ditampilkan di pop-up pemilihan.
 *
 * Label tiap berkas dicari dari bagian yang memintanya — nama dokumen awal, bunyi
 * tindakan, nomor periode — bukan dibiarkan sebagai nama berkas dari kamera. Pada pop-up
 * berisi dua puluh baris "IMG_20260114.jpg", tidak ada yang bisa memilih apa pun.
 */
export async function loadPackageContents(claimId: string): Promise<PackageContents> {
  const claim = await db.claim.findUnique({
    where: { id: claimId },
    select: {
      id: true,
      claimNo: true,
      cpar: { select: { id: true, cycle: true, sections: { select: { key: true, data: true } } } },
    },
  });

  if (!claim) throw new Error("Klaim tidak ditemukan.");

  const [attachments, documents, initialDocuments, periods, checks] = await Promise.all([
    db.attachment.findMany({
      where: { claimId },
      include: { uploadedBy: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.generatedDocument.findMany({
      where: { claimId },
      orderBy: [{ kind: "asc" }, { cycle: "asc" }, { version: "asc" }],
    }),
    db.initialDocument.findMany({ select: { id: true, name: true } }),
    db.monitoringPeriod.findMany({
      where: { claimId },
      select: { id: true, periodNo: true, cycle: true },
    }),
    db.monitoringCheck.findMany({
      where: { period: { claimId } },
      select: { id: true, item: { select: { title: true } } },
    }),
  ]);

  const documentName = new Map(initialDocuments.map((entry) => [entry.id, entry.name]));
  const periodName = new Map(
    periods.map((period) => [period.id, `Periode ${period.periodNo} (siklus ${period.cycle})`]),
  );
  const checkName = new Map(checks.map((check) => [check.id, check.item.title]));

  // Bunyi tindakan hidup di kolom Json, jadi dikumpulkan sekali di sini — bukan dibaca
  // ulang untuk tiap berkas.
  const actionName = new Map<string, string>();
  for (const section of claim.cpar?.sections ?? []) {
    if (!(ACTION_PLAN_SECTIONS as readonly string[]).includes(section.key)) continue;

    const plan = readActionPlan(section.data);
    for (const item of plan.items) {
      if (item.id) {
        actionName.set(item.id, `${SECTION_LABEL[section.key]} — ${item.action}`);
      }
    }
  }

  const labelFor = (attachment: (typeof attachments)[number]): string => {
    if (attachment.caption?.trim()) return attachment.caption.trim();

    switch (attachment.entityType) {
      case "CparInitialDocument":
        return documentName.get(attachment.entityId) ?? attachment.originalName;
      case "CparActionItem":
        return actionName.get(attachment.entityId) ?? attachment.originalName;
      case "MonitoringPeriod":
        return periodName.get(attachment.entityId) ?? attachment.originalName;
      case "MonitoringCheck":
        return checkName.get(attachment.entityId) ?? attachment.originalName;
      default:
        return attachment.originalName;
    }
  };

  const groups = GROUPS.map((group) => ({
    order: group.order,
    folder: group.folder,
    items: attachments
      .filter((attachment) => attachment.entityType === group.entityType)
      .map(
        (attachment): PackageItem => ({
          id: attachment.id,
          label: labelFor(attachment),
          originalName: attachment.originalName,
          sizeBytes: attachment.size,
          uploadedByName: attachment.uploadedBy.name,
          uploadedAt: attachment.createdAt,
        }),
      ),
  })).filter((group) => group.items.length > 0);

  const packaged = documents.map(
    (document): PackageDocument => ({
      id: document.id,
      title: DOCUMENT_TITLE[document.kind],
      fileName: `${safeSegment(DOCUMENT_TITLE[document.kind])} - siklus ${document.cycle} v${document.version}${
        document.isDraft ? " (DRAFT)" : ""
      }.pdf`,
      path: document.path,
      isDraft: document.isDraft,
      generatedAt: document.generatedAt,
    }),
  );

  const present = new Set(documents.map((document) => document.kind));
  const missingDocuments = EXPECTED_DOCUMENTS.filter((kind) => !present.has(kind)).map(
    (kind) => DOCUMENT_TITLE[kind],
  );

  return {
    claimId: claim.id,
    claimNo: claim.claimNo,
    folderName: folderName(claim.claimNo, claim.id),
    documents: packaged,
    missingDocuments,
    groups,
    totalBytes: groups
      .flatMap((group) => group.items)
      .reduce((sum, item) => sum + item.sizeBytes, 0),
  };
}

export interface PackageSelection {
  /** Id lampiran yang dipilih. Kosong berarti dokumen saja. */
  readonly attachmentIds: ReadonlySet<string>;
  readonly actorName: string;
}

/**
 * Menyusun arsipnya, satu berkas pada satu waktu.
 *
 * Berkas yang hilang dari disk tidak menghentikan seluruh paket: ia dicatat di manifes
 * sebagai tidak terbaca, dan sisanya tetap terunduh. Paket yang gagal seluruhnya karena
 * satu berkas lama yang terlanjur terhapus adalah paket yang tidak pernah bisa dibuat.
 */
export async function* packageEntries(
  contents: PackageContents,
  selection: PackageSelection,
): AsyncGenerator<ZipEntry> {
  const root = contents.folderName;
  const manifest: string[] = [];
  const unreadable: string[] = [];
  const skipped: string[] = [];

  manifest.push(
    `PAKET KLAIM ${contents.claimNo ?? "(draft)"}`,
    `Disusun ${formatDateTime(new Date())} oleh ${selection.actorName}`,
    "",
  );

  // Jalur seluruh berkas yang dipilih diambil sekali. Satu query per berkas akan
  // menjadi puluhan perjalanan ke basis data untuk arsip yang sama.
  const chosenIds = [...selection.attachmentIds];
  const paths = new Map(
    (
      await db.attachment.findMany({
        where: { id: { in: chosenIds }, claimId: contents.claimId },
        select: { id: true, path: true },
      })
    ).map((row) => [row.id, row.path]),
  );

  const read = async (path: string): Promise<Uint8Array | null> => {
    try {
      return new Uint8Array(await storage.read(path));
    } catch {
      return null;
    }
  };

  // ── Lembar cetak ──
  if (contents.documents.length > 0) {
    manifest.push(DOCUMENT_FOLDER);
    const taken = new Set<string>();

    for (const document of contents.documents) {
      const data = await read(document.path);
      const name = uniqueName(taken, safeSegment(document.fileName, "dokumen.pdf"));

      if (!data) {
        unreadable.push(`${DOCUMENT_FOLDER}/${name}`);
        continue;
      }

      manifest.push(`  ${name}  (dibuat ${formatDate(document.generatedAt)})`);
      yield { path: `${root}/${DOCUMENT_FOLDER}/${name}`, data, modifiedAt: document.generatedAt };
    }

    manifest.push("");
  }

  // ── Evidence, per bagian yang memintanya ──
  for (const group of contents.groups) {
    const chosen = group.items.filter((item) => selection.attachmentIds.has(item.id));
    const left = group.items.length - chosen.length;

    if (left > 0) {
      skipped.push(`${group.folder}: ${left} dari ${group.items.length} berkas tidak dipilih`);
    }

    if (chosen.length === 0) continue;

    const folder = `${String(group.order).padStart(2, "0")} ${group.folder}`;
    manifest.push(folder);

    const taken = new Set<string>();

    for (const item of chosen) {
      // Label dipakai sebagai nama berkas supaya isinya terbaca tanpa dibuka; ekstensi
      // diambil dari nama aslinya, karena label diketik orang dan jarang memuatnya.
      const extension = item.originalName.includes(".")
        ? item.originalName.slice(item.originalName.lastIndexOf("."))
        : "";
      const base = safeSegment(item.label, item.originalName);
      const name = uniqueName(
        taken,
        base.toLowerCase().endsWith(extension.toLowerCase()) ? base : `${base}${extension}`,
      );

      const path = paths.get(item.id);
      const data = path ? await read(path) : null;

      if (!data) {
        unreadable.push(`${folder}/${name}`);
        continue;
      }

      manifest.push(`  ${name}  (${item.originalName}, ${item.uploadedByName})`);
      yield { path: `${root}/${folder}/${name}`, data, modifiedAt: item.uploadedAt };
    }

    manifest.push("");
  }

  if (contents.missingDocuments.length > 0) {
    manifest.push(
      "BELUM PERNAH DIBUAT",
      "Lembar di bawah ini tidak ada di paket karena klaimnya belum sampai ke tahap",
      "yang membuatnya, bukan karena tertinggal:",
      ...contents.missingDocuments.map((title) => `  ${title}`),
      "",
    );
  }

  if (skipped.length > 0) {
    manifest.push("TIDAK DIPILIH", ...skipped.map((line) => `  ${line}`), "");
  }

  if (unreadable.length > 0) {
    manifest.push(
      "GAGAL DIBACA",
      "Berkas di bawah ini tercatat di portal tetapi tidak terbaca dari penyimpanan:",
      ...unreadable.map((line) => `  ${line}`),
      "",
    );
  }

  yield {
    path: `${root}/ISI-PAKET.txt`,
    data: new TextEncoder().encode(manifest.join("\n")),
  };
}

/**
 * Nama berkas arsipnya.
 *
 * Memakai nomor klaim dan tanggal: map unduhan orang berisi puluhan berkas, dan
 * "paket.zip" yang keempat akan tersimpan sebagai "paket (3).zip" tanpa ada yang tahu
 * isinya klaim yang mana.
 */
export function packageFileName(contents: PackageContents, now = new Date()): string {
  const stamp = formatDate(now).replace(/\s+/g, "");

  return safeSegment(`${contents.folderName} - paket ${stamp}`, "paket-klaim") + ".zip";
}
