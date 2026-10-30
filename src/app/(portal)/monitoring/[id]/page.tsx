import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { FileText } from "lucide-react";

import { ImprovementReportForm } from "@/components/monitoring/improvement-report-form";
import { PeriodList, type PeriodView } from "@/components/monitoring/period-list";
import { StartMonitoring } from "@/components/monitoring/start-monitoring";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatusRail } from "@/components/shared/status-rail";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { closingBlocker, monitoringProgress } from "@/lib/monitoring";
import { DOCUMENT_TITLE } from "@/lib/pdf";
import { can, canViewClaim, type ClaimContext } from "@/lib/permissions";
import { getPortalUser } from "@/lib/session";
import { A3_BLOCK_LABEL } from "@/schemas/monitoring";
import { readA3Content } from "@/server/print-data";

export const metadata: Metadata = {
  title: "Monitoring",
};

/**
 * Halaman pemantauan CAPA — Modul 4 (§6).
 *
 * Beralamat id klaim seperti halaman CPAR, karena pemantauan adalah tahap klaim yang
 * sama, bukan entitas tersendiri (PLAN D1). Periode siklus sebelumnya ikut ditampilkan
 * supaya percobaan yang gagal tetap terbaca setelah siklus baru dibuka.
 */
export default async function MonitoringPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getPortalUser();

  const claim = await db.claim.findUnique({
    where: { id },
    select: {
      id: true,
      claimNo: true,
      status: true,
      createdById: true,
      partName: true,
      internalPartNo: true,
      cpar: {
        select: {
          id: true,
          cparNo: true,
          cycle: true,
          responsibleDeptId: true,
          responsibleDept: { select: { code: true, name: true } },
          cftMembers: { select: { departmentId: true } },
        },
      },
    },
  });

  if (!claim) notFound();

  const context: ClaimContext = {
    status: claim.status,
    createdById: claim.createdById,
    cpar: claim.cpar
      ? {
          responsibleDeptId: claim.cpar.responsibleDeptId,
          cftMemberDeptIds: claim.cpar.cftMembers.map((member) => member.departmentId),
        }
      : null,
  };

  if (!canViewClaim(user, context)) forbidden();

  // Klaim yang belum punya CPAR tidak pernah sampai ke tahap pemantauan; mengarahkan
  // ke halaman klaim lebih berguna daripada halaman kosong tanpa penjelasan.
  if (!claim.cpar) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Belum ada CPAR</CardTitle>
            <CardDescription>
              Pemantauan CAPA baru terbuka setelah CPAR diterbitkan dan disetujui seluruh
              verifier.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={`/claims/${claim.id}`} className="text-sm text-nid-orange-700 hover:underline">
              Buka detail klaim
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const cycle = claim.cpar.cycle;

  const [periods, reports, documents] = await Promise.all([
    db.monitoringPeriod.findMany({
      where: { claimId: id },
      include: { filledBy: { select: { name: true } } },
      orderBy: [{ cycle: "asc" }, { periodNo: "asc" }],
    }),
    db.improvementReport.findMany({
      where: { claimId: id },
      include: { submittedBy: { select: { name: true, jobTitle: true } } },
      orderBy: { submittedAt: "desc" },
    }),
    db.generatedDocument.findMany({
      where: { claimId: id, kind: { in: ["MONITORING", "A3"] } },
      orderBy: [{ cycle: "desc" }, { version: "desc" }],
    }),
  ]);

  const attachments = await db.attachment.findMany({
    where: {
      entityType: "MonitoringPeriod",
      entityId: { in: periods.map((period) => period.id) },
    },
    include: { uploadedBy: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  const evidenceByPeriod = new Map<string, PeriodView["evidence"][number][]>();
  for (const file of attachments) {
    const list = evidenceByPeriod.get(file.entityId) ?? [];
    list.push({
      id: file.id,
      originalName: file.originalName,
      url: `/api/files/${file.path}`,
      uploadedByName: file.uploadedBy.name,
      uploadedAt: file.createdAt,
    });
    evidenceByPeriod.set(file.entityId, list);
  }

  const toView = (period: (typeof periods)[number]): PeriodView => ({
    id: period.id,
    periodNo: period.periodNo,
    dueDate: period.dueDate,
    status: period.status,
    note: period.note,
    filledByName: period.filledBy?.name ?? null,
    filledAt: period.filledAt,
    evidence: evidenceByPeriod.get(period.id) ?? [],
  });

  const currentPeriods = periods.filter((period) => period.cycle === cycle).map(toView);
  const earlierCycles = [...new Set(periods.filter((p) => p.cycle < cycle).map((p) => p.cycle))].sort(
    (a, b) => b - a,
  );

  const progress = monitoringProgress(periods, cycle);
  const blocker = closingBlocker(progress);

  const canStart = can(user, "monitoring.start", context);
  const canUpload = can(user, "monitoring.evidence.upload", context);
  const canAssess = can(user, "monitoring.setEffectiveness", context);
  const canClose = can(user, "monitoring.submitReport", context);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-bold text-nid-orange-700">
              CAPA Monitoring
            </h1>
            <p className="text-sm text-muted-foreground">
              <Link href={`/claims/${claim.id}`} className="tabular hover:underline">
                {claim.claimNo}
              </Link>{" "}
              ·{" "}
              <Link href={`/cpar/${claim.id}`} className="tabular hover:underline">
                {claim.cpar.cparNo}
              </Link>{" "}
              · {claim.partName} · {claim.internalPartNo}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={claim.status} showHint />
            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
              Siklus {cycle}
            </span>
          </div>
        </div>

        <Card>
          <CardContent className="p-4">
            <StatusRail status={claim.status} cycle={cycle} />
          </CardContent>
        </Card>
      </header>

      {claim.status === "CPAR_APPROVED" && canStart ? (
        <Card>
          <CardHeader>
            <CardTitle>Mulai pemantauan</CardTitle>
            <CardDescription>
              Tentukan berapa periode efektivitas akan diukur dan berapa jarak antar periode.
              Tenggat dihitung dengan hari kerja, jadi tidak ada periode yang jatuh pada akhir
              pekan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StartMonitoring claimId={id} />
          </CardContent>
        </Card>
      ) : null}

      {currentPeriods.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Periode siklus {cycle}</CardTitle>
            <CardDescription>
              {progress.effective} dari {progress.total} periode dinyatakan efektif.
              {progress.notEffective.length > 0
                ? ` Periode ${progress.notEffective.join(", ")} gagal dan memulangkan CPAR ke pengisian.`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PeriodList periods={currentPeriods} canUpload={canUpload} canAssess={canAssess} />
          </CardContent>
        </Card>
      ) : null}

      {earlierCycles.map((earlier) => (
        <Card key={earlier}>
          <CardHeader>
            <CardTitle>Periode siklus {earlier}</CardTitle>
            <CardDescription>
              Percobaan sebelumnya. Tidak pernah dihapus — inilah alasan siklus {earlier + 1}{" "}
              dibuka.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PeriodList
              periods={periods.filter((period) => period.cycle === earlier).map(toView)}
              canUpload={false}
              canAssess={false}
            />
          </CardContent>
        </Card>
      ))}

      {claim.status === "CAPA_MONITORING" && canClose ? (
        <Card>
          <CardHeader>
            <CardTitle>Improvement Report</CardTitle>
            <CardDescription>
              Laporan penutup. Menyimpannya menutup klaim sebagai Verified Closed, dan mencetak
              lembar monitoring beserta A3.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ImprovementReportForm claimId={id} blocker={blocker} />
          </CardContent>
        </Card>
      ) : null}

      {reports.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Laporan tersimpan</CardTitle>
            <CardDescription>Satu laporan per siklus yang berhasil ditutup.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {reports.map((report) => {
              const blocks = readA3Content(report.a3Content);

              return (
                <article key={report.id} className="rounded-lg border border-nid-border px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="rounded-full bg-secondary px-2 py-0.5 font-medium tabular text-foreground">
                      Siklus {report.cycle}
                    </span>
                    <span>{report.submittedBy.name}</span>
                    <span>·</span>
                    <span>{formatDateTime(report.submittedAt)}</span>
                  </div>

                  <p className="mt-2 whitespace-pre-line break-words text-sm">{report.summary}</p>

                  {report.lessonLearned ? (
                    <p className="mt-2 whitespace-pre-line break-words text-sm">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        Lesson learned{" "}
                      </span>
                      {report.lessonLearned}
                    </p>
                  ) : null}

                  {Object.keys(blocks).length > 0 ? (
                    <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                      {Object.entries(blocks).map(([block, value]) => (
                        <div key={block} className="min-w-0">
                          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                            {A3_BLOCK_LABEL[block as keyof typeof A3_BLOCK_LABEL] ?? block}
                          </dt>
                          <dd className="mt-0.5 whitespace-pre-line break-words text-sm">
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </article>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {documents.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Dokumen penutup</CardTitle>
            <CardDescription>Dicetak saat klaim dinyatakan Verified Closed.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-nid-border">
              {documents.map((document) => (
                <li
                  key={document.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 first:pt-0"
                >
                  <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <a
                    href={`/api/files/${document.path}`}
                    target="_blank"
                    rel="noopener"
                    className="text-sm font-medium text-nid-orange-700 hover:underline"
                  >
                    {DOCUMENT_TITLE[document.kind]}
                  </a>
                  <span className="text-xs tabular text-muted-foreground">
                    siklus {document.cycle} · v{document.version}
                  </span>
                  <span className="ml-auto text-xs tabular text-muted-foreground">
                    {formatDateTime(document.generatedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
