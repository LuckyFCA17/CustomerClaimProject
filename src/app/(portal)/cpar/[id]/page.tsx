import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { CalendarClock, CircleDashed } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatusRail } from "@/components/shared/status-rail";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { canViewClaim } from "@/lib/permissions";
import { getPortalUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "CPAR",
};

/**
 * Halaman CPAR — tujuan Action Button B (§6 Modul 2).
 *
 * Alamatnya memakai id klaim, bukan id CPAR: satu klaim punya paling banyak satu CPAR
 * (PLAN D1), sehingga tautan dari halaman klaim tetap sama walau CPAR dibuat belakangan.
 *
 * Fase 4 menampilkan penetapan penanggung jawabnya. Pengisian tujuh section, unggah
 * evidence, dan rantai verifikasi dibangun pada Fase 5.
 */
const SECTION_LABEL: Record<string, string> = {
  PROBLEM_DESCRIPTION: "Problem description",
  TEMPORARY_ACTION: "Temporary action",
  ROOT_CAUSE_OCCURRENCE: "Root cause — occurrence",
  ROOT_CAUSE_OUTFLOW: "Root cause — outflow",
  PERMANENT_COUNTERMEASURE: "Permanent countermeasure",
  STANDARDIZATION_HORIZONTAL: "Standardization & horizontal deployment",
  EFFECTIVENESS_PLAN: "Effectiveness plan",
};

const SECTION_ORDER = Object.keys(SECTION_LABEL);

export default async function CparPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getPortalUser();

  const cpar = await db.cpar.findUnique({
    where: { claimId: id },
    include: {
      claim: {
        select: {
          id: true,
          claimNo: true,
          status: true,
          createdById: true,
          partName: true,
          internalPartNo: true,
          ncDetail: { select: { name: true } },
        },
      },
      responsibleDept: { select: { code: true, name: true } },
      cftMembers: { include: { department: { select: { code: true, name: true } } } },
      initialDocuments: { include: { initialDocument: { select: { name: true } } } },
      sections: true,
    },
  });

  if (!cpar) notFound();

  const allowed = canViewClaim(user, {
    status: cpar.claim.status,
    createdById: cpar.claim.createdById,
    cpar: {
      responsibleDeptId: cpar.responsibleDeptId,
      cftMemberDeptIds: cpar.cftMembers.map((member) => member.departmentId),
    },
  });

  if (!allowed) forbidden();

  const overdue = cpar.dueDate < new Date() && !cpar.submittedAt;
  const sections = SECTION_ORDER.map(
    (key) => cpar.sections.find((section) => section.key === key) ?? null,
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-bold text-nid-orange-700">{cpar.cparNo}</h1>
            <p className="text-sm text-muted-foreground">
              <Link href={`/claims/${cpar.claim.id}`} className="tabular hover:underline">
                {cpar.claim.claimNo}
              </Link>{" "}
              · {cpar.claim.partName} · {cpar.claim.internalPartNo}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={cpar.claim.status} showHint />
            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
              Siklus {cpar.cycle}
            </span>
          </div>
        </div>

        <Card>
          <CardContent className="p-4">
            <StatusRail status={cpar.claim.status} cycle={cpar.cycle} />
          </CardContent>
        </Card>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Penanggung jawab</CardTitle>
          <CardDescription>
            Ditetapkan saat CPAR diterbitkan. Pada tipe CFT, hanya head lead dept yang menjadi
            verifier wajib.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <Row
            label="Responsibility"
            value={cpar.responsibilityType === "CFT" ? "Cross Functional Team" : "User Department"}
          />
          <Row
            label={cpar.responsibilityType === "CFT" ? "Lead department" : "Departemen"}
            value={`${cpar.responsibleDept.code} — ${cpar.responsibleDept.name}`}
          />
          <Row
            label="Anggota CFT"
            value={
              cpar.cftMembers.length > 0
                ? cpar.cftMembers.map((member) => member.department.code).join(", ")
                : "—"
            }
          />
          <Row label="Diterbitkan" value={formatDateTime(cpar.issuedAt)} />
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Tenggat pengisian
            </dt>
            <dd className="mt-0.5 flex flex-wrap items-center gap-2 text-sm">
              <CalendarClock aria-hidden className="size-4 text-muted-foreground" />
              {formatDate(cpar.dueDate)}
              {overdue ? (
                <span className="rounded-full bg-[var(--status-danger-bg)] px-2 py-0.5 text-xs font-medium text-[var(--status-danger)]">
                  Lewat tenggat
                </span>
              ) : null}
            </dd>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Initial Document Request</CardTitle>
          <CardDescription>Dokumen yang diminta dilampirkan bersama CPAR.</CardDescription>
        </CardHeader>
        <CardContent>
          {cpar.initialDocuments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada dokumen yang diminta.</p>
          ) : (
            <ul className="space-y-2">
              {cpar.initialDocuments.map((entry) => (
                <li
                  key={entry.initialDocumentId}
                  className="flex items-center gap-2.5 text-sm"
                >
                  <CircleDashed
                    aria-hidden
                    className={
                      entry.fulfilledAt ? "size-4 text-[var(--status-closed)]" : "size-4 text-muted-foreground"
                    }
                  />
                  {entry.initialDocument.name}
                  {entry.fulfilledAt ? (
                    <span className="text-xs text-muted-foreground">
                      · dilampirkan {formatDate(entry.fulfilledAt)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Section CPAR</CardTitle>
          <CardDescription>
            Tujuh section dibuat kosong saat CPAR terbit. Pengisian per role, unggah evidence, dan
            rantai verifikasi dibangun pada Fase 5.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="divide-y divide-nid-border">
            {SECTION_ORDER.map((key, index) => {
              const section = sections[index];
              const filled = Boolean(section?.content?.trim());

              return (
                <li key={key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 first:pt-0">
                  <span className="w-5 text-xs tabular text-muted-foreground">{index + 1}</span>
                  <span className="min-w-0 flex-1 text-sm">{SECTION_LABEL[key]}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      backgroundColor: filled ? "var(--status-closed-bg)" : "var(--status-draft-bg)",
                      color: filled ? "var(--status-closed)" : "var(--status-draft)",
                    }}
                  >
                    {filled ? "Terisi" : "Kosong"}
                  </span>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm">{value || "—"}</dd>
    </div>
  );
}
