import "server-only";

import {
  ACTION_ITEM_ENTITY,
  ACTION_PLAN_SECTIONS,
  INITIAL_DOCUMENT_ENTITY,
  SECTION_LABEL,
  type EvidenceSlot,
} from "@/lib/cpar";
import { db } from "@/lib/db";
import type { EvidenceRequestRow } from "@/lib/evidence-requests";
import { can, visibleClaimsWhere, type Actor, type ClaimContext } from "@/lib/permissions";
import { readActionPlan } from "@/schemas/action-plan";

/**
 * Mengumpulkan seluruh permintaan evidence yang masih dapat dikerjakan.
 *
 * Dibatasi pada CPAR yang klaimnya berada di fase pengisian. Di luar fase itu section
 * sudah terkunci dan unggahan ditolak server, jadi barisnya hanya akan menjadi daftar
 * pekerjaan yang tidak dapat dikerjakan siapa pun — sekaligus membuat jumlah baris yang
 * dibaca tidak tumbuh bersama seluruh riwayat pabrik.
 *
 * Dua dari tiga sumbernya tersimpan di kolom Json, jadi perakitannya memang terjadi di
 * aplikasi. Yang tetap dikerjakan basis data adalah bagian yang bisa: daftar CPAR-nya,
 * jumlah berkas per sasaran, dan nama PIC-nya.
 */

const FILLING_STATUSES = ["CPAR_ISSUED", "CPAR_IN_PROGRESS", "CPAR_REVISION"] as const;

export async function loadEvidenceRequests(actor: Actor): Promise<EvidenceRequestRow[]> {
  const cpars = await db.cpar.findMany({
    where: {
      claim: { AND: [visibleClaimsWhere(actor), { status: { in: [...FILLING_STATUSES] } }] },
    },
    orderBy: [{ dueDate: "asc" }],
    select: {
      id: true,
      cparNo: true,
      dueDate: true,
      responsibleDeptId: true,
      cftMembers: { select: { departmentId: true } },
      claim: { select: { id: true, claimNo: true, status: true, createdById: true } },
      initialDocuments: {
        select: {
          initialDocumentId: true,
          picId: true,
          initialDocument: { select: { name: true } },
        },
      },
      sections: {
        where: { key: { in: [...ACTION_PLAN_SECTIONS] } },
        select: { key: true, data: true, lockedAt: true },
      },
    },
  });

  if (cpars.length === 0) return [];

  const claimIds = cpars.map((cpar) => cpar.claim.id);

  // Berkas dihitung per pasangan klaim dan sasaran: id dokumen yang diminta berulang di
  // banyak klaim, jadi menghitungnya tanpa claimId akan mencampur berkas klaim lain.
  const [counts, people] = await Promise.all([
    db.attachment.groupBy({
      by: ["claimId", "entityId"],
      where: {
        entityType: { in: [INITIAL_DOCUMENT_ENTITY, ACTION_ITEM_ENTITY] },
        claimId: { in: claimIds },
      },
      _count: { _all: true },
    }),
    db.user.findMany({ select: { id: true, name: true } }),
  ]);

  const fileCount = new Map(
    counts.map((row) => [`${row.claimId}:${row.entityId}`, row._count._all]),
  );
  const nameById = new Map(people.map((person) => [person.id, person.name]));

  const rows: EvidenceRequestRow[] = [];

  for (const cpar of cpars) {
    const context: ClaimContext = {
      status: cpar.claim.status,
      createdById: cpar.claim.createdById,
      cpar: {
        responsibleDeptId: cpar.responsibleDeptId,
        cftMemberDeptIds: cpar.cftMembers.map((member) => member.departmentId),
      },
    };

    const allowed = can(actor, "cpar.evidence.upload", context);
    const claimId = cpar.claim.id;

    for (const request of cpar.initialDocuments) {
      rows.push({
        key: `${claimId}:doc:${request.initialDocumentId}`,
        kind: "INITIAL_DOCUMENT",
        claimId,
        claimNo: cpar.claim.claimNo ?? "—",
        cparNo: cpar.cparNo,
        sectionLabel: "Initial Document Request",
        title: request.initialDocument.name,
        picId: request.picId,
        picName: request.picId ? (nameById.get(request.picId) ?? null) : null,
        // Dokumen awal diminta dilampirkan bersama CPAR, jadi tenggatnya tenggat CPAR.
        dueDate: cpar.dueDate,
        fileCount: fileCount.get(`${claimId}:${request.initialDocumentId}`) ?? 0,
        targetId: request.initialDocumentId,
        canUpload: allowed,
      });
    }

    for (const section of cpar.sections) {
      const locked = section.lockedAt !== null;

      for (const item of readActionPlan(section.data).items) {
        if (!item.id) continue;

        rows.push({
          key: `${claimId}:item:${item.id}`,
          kind: "ACTION_ITEM",
          claimId,
          claimNo: cpar.claim.claimNo ?? "—",
          cparNo: cpar.cparNo,
          sectionLabel: SECTION_LABEL[section.key],
          title: item.action,
          picId: item.picId,
          picName: nameById.get(item.picId) ?? null,
          // Tanggal implementasi yang berperan sebagai tenggat; boleh belum ada.
          dueDate: item.implementedOn ? new Date(`${item.implementedOn}T00:00:00.000Z`) : null,
          fileCount: fileCount.get(`${claimId}:${item.id}`) ?? 0,
          targetId: item.id,
          canUpload: allowed && !locked,
        });
      }
    }
  }

  return rows;
}

/**
 * Kotak evidence milik satu CPAR, untuk gerbang submit final.
 *
 * Sumbernya sama persis dengan `loadEvidenceRequests` — dokumen awal yang diminta dan
 * tiap baris action plan — tetapi tanpa penyaringan izin dan tanpa status klaim: yang
 * ditanyakan di sini bukan "apa yang boleh saya kerjakan", melainkan "apa yang masih
 * kurang pada CPAR ini". Keduanya hidup di berkas yang sama supaya definisi "apa saja
 * yang dianggap evidence" tidak pernah bercabang; kalau satu sumber bertambah, kedua
 * pemakainya ikut berubah.
 */
export async function loadCparEvidenceSlots(claimId: string): Promise<EvidenceSlot[]> {
  const cpar = await db.cpar.findUnique({
    where: { claimId },
    select: {
      initialDocuments: {
        select: { initialDocumentId: true, initialDocument: { select: { name: true } } },
      },
      sections: {
        where: { key: { in: [...ACTION_PLAN_SECTIONS] } },
        select: { key: true, data: true },
      },
    },
  });

  if (!cpar) return [];

  const targets = [
    ...cpar.initialDocuments.map((entry) => entry.initialDocumentId),
    ...cpar.sections.flatMap((section) =>
      readActionPlan(section.data)
        .items.map((item) => item.id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (targets.length === 0) return [];

  // Disaring dengan claimId juga: id dokumen yang diminta berulang di banyak klaim,
  // jadi menghitung tanpa itu akan menganggap berkas klaim lain sebagai bukti di sini.
  const counts = await db.attachment.groupBy({
    by: ["entityId"],
    where: {
      entityType: { in: [INITIAL_DOCUMENT_ENTITY, ACTION_ITEM_ENTITY] },
      entityId: { in: targets },
      claimId,
    },
    _count: { _all: true },
  });

  const fileCount = new Map(counts.map((row) => [row.entityId, row._count._all]));

  const slots: EvidenceSlot[] = cpar.initialDocuments.map((entry) => ({
    sectionLabel: "Initial Document Request",
    title: entry.initialDocument.name,
    fileCount: fileCount.get(entry.initialDocumentId) ?? 0,
  }));

  for (const section of cpar.sections) {
    for (const item of readActionPlan(section.data).items) {
      if (!item.id) continue;

      slots.push({
        sectionLabel: SECTION_LABEL[section.key],
        title: item.action,
        fileCount: fileCount.get(item.id) ?? 0,
      });
    }
  }

  return slots;
}
