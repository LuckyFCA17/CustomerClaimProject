import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { CalendarClock, CircleDashed, FileText } from "lucide-react";

import { CparEvidence } from "@/components/cpar/cpar-evidence";
import { ProblemDescriptionPanel } from "@/components/cpar/problem-description";
import { TemporaryActionEditor } from "@/components/cpar/temporary-action-editor";
import { SectionEditor, type SectionView } from "@/components/cpar/section-editor";
import { SubmitFinal } from "@/components/cpar/submit-final";
import {
  VerificationChain,
  VerificationHistory,
  type VerificationView,
} from "@/components/cpar/verification-chain";
import { VerificationPanel } from "@/components/cpar/verification-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatusRail } from "@/components/shared/status-rail";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  SECTION_ORDER,
  missingSectionLabels,
  requiredVerifiers,
  verificationProgress,
  verifierCapacity,
} from "@/lib/cpar";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { DOCUMENT_TITLE } from "@/lib/pdf";
import { can, canFillSection, canViewClaim, type ClaimContext } from "@/lib/permissions";
import { getPortalUser } from "@/lib/session";
import { readTemporaryAction } from "@/schemas/temporary-action";
import { loadProblemDescription } from "@/server/cpar-problem";

export const metadata: Metadata = {
  title: "CPAR",
};

/**
 * Halaman CPAR — Modul 3 (§6).
 *
 * Alamatnya memakai id klaim, bukan id CPAR: satu klaim punya paling banyak satu CPAR
 * (PLAN D1), sehingga tautan dari halaman klaim tetap sama walau CPAR dibuat belakangan.
 *
 * Seluruh hak akses dihitung di sini dan diturunkan ke komponen sebagai boolean. Yang
 * menolak tetap server action — ini hanya menentukan apa yang digambar.
 */
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
      sections: { include: { filledBy: { select: { name: true } } } },
      verifications: {
        include: { verifier: { select: { name: true, jobTitle: true } } },
        orderBy: { decidedAt: "asc" },
      },
    },
  });

  if (!cpar) notFound();

  const context: ClaimContext = {
    status: cpar.claim.status,
    createdById: cpar.claim.createdById,
    cpar: {
      responsibleDeptId: cpar.responsibleDeptId,
      cftMemberDeptIds: cpar.cftMembers.map((member) => member.departmentId),
    },
  };

  if (!canViewClaim(user, context)) forbidden();

  const [problem, evidence, documents] = await Promise.all([
    loadProblemDescription(id),
    db.attachment.findMany({
      where: { entityType: "Cpar", entityId: cpar.id },
      include: { uploadedBy: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.generatedDocument.findMany({
      where: { claimId: id, kind: "CPAR" },
      orderBy: [{ cycle: "desc" }, { version: "desc" }],
    }),
  ]);

  const sections: SectionView[] = SECTION_ORDER.map((key) => {
    const record = cpar.sections.find((section) => section.key === key);

    return {
      key,
      content: record?.content ?? null,
      isRequired: record?.isRequired ?? true,
      data: record?.data,
      revisionNote: record?.revisionNote ?? null,
      lockedAt: record?.lockedAt ?? null,
      filledByName: record?.filledBy?.name ?? null,
      filledAt: record?.filledAt ?? null,
      canFill: canFillSection(user, key, context),
    };
  });

  const verifications: VerificationView[] = cpar.verifications.map((entry) => ({
    id: entry.id,
    role: entry.role,
    decision: entry.decision,
    comment: entry.comment,
    targetSections: entry.targetSections,
    cycle: entry.cycle,
    decidedAt: entry.decidedAt,
    verifierName: entry.verifier.name,
    verifierJobTitle: entry.verifier.jobTitle,
  }));

  const temporaryAction = readTemporaryAction(
    cpar.sections.find((entry) => entry.key === "TEMPORARY_ACTION")?.data,
  );

  const progress = verificationProgress(verifications, cpar.cycle);
  const missing = missingSectionLabels(sections);

  const canSubmit = can(user, "cpar.submitFinal", context);
  const capacity = can(user, "cpar.verify", context)
    ? verifierCapacity(user.roles, user.departmentId, cpar)
    : null;
  const alreadyDecided = verifications.some(
    (entry) => entry.role === capacity && entry.cycle === cpar.cycle,
  );

  const overdue = cpar.dueDate < new Date() && !cpar.submittedAt;
  const underVerification = cpar.claim.status === "CPAR_UNDER_VERIFICATION";

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
                <li key={entry.initialDocumentId} className="flex items-center gap-2.5 text-sm">
                  <CircleDashed
                    aria-hidden
                    className={
                      entry.fulfilledAt
                        ? "size-4 text-[var(--status-closed)]"
                        : "size-4 text-muted-foreground"
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
            Tujuh section, masing-masing dapat diisi oleh role tertentu. Section yang bukan bagian
            Anda tetap terbaca agar pengisian saling nyambung.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SectionEditor
            claimId={id}
            sections={sections}
            lockReason={underVerification ? "VERIFYING" : "APPROVED"}
            derived={{
              PROBLEM_DESCRIPTION: <ProblemDescriptionPanel problem={problem} />,
              TEMPORARY_ACTION: (
                <TemporaryActionEditor
                  claimId={id}
                  value={temporaryAction}
                  canFill={canFillSection(user, "TEMPORARY_ACTION", context)}
                  locked={
                    cpar.sections.find((entry) => entry.key === "TEMPORARY_ACTION")?.lockedAt !==
                    null
                  }
                  legacyText={
                    temporaryAction.entries.length === 0
                      ? (cpar.sections.find((entry) => entry.key === "TEMPORARY_ACTION")?.content ??
                        null)
                      : null
                  }
                />
              ),
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evidence</CardTitle>
          <CardDescription>
            Berkas pendukung untuk seluruh CPAR — foto perbaikan, standar kerja yang diperbarui,
            atau data pengukuran.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CparEvidence
            claimId={id}
            canUpload={can(user, "cpar.evidence.upload", context)}
            files={evidence.map((file) => ({
              id: file.id,
              originalName: file.originalName,
              url: `/api/files/${file.path}`,
              uploadedByName: file.uploadedBy.name,
              uploadedAt: file.createdAt,
            }))}
          />
        </CardContent>
      </Card>

      {canSubmit ? (
        <Card>
          <CardHeader>
            <CardTitle>Submit final report</CardTitle>
            <CardDescription>
              {missing.length === 0
                ? "Seluruh section wajib sudah terisi. Mengirim CPAR mengunci isinya dan membuka rantai verifikasi."
                : `Masih ada ${missing.length} section wajib yang kosong.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SubmitFinal claimId={id} cparNo={cpar.cparNo} />
          </CardContent>
        </Card>
      ) : null}

      {cpar.submittedAt ? (
        <Card>
          <CardHeader>
            <CardTitle>Rantai verifikasi</CardTitle>
            <CardDescription>
              CPAR disetujui hanya bila keempat kapasitas di bawah menyatakan Verified pada siklus
              yang sama. Satu Needs revision membuka siklus baru dan verifikasi diulang.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <VerificationChain
              required={requiredVerifiers()}
              verifications={verifications}
              cycle={cpar.cycle}
            />

            {underVerification && capacity && !alreadyDecided ? (
              <div className="border-t border-nid-border pt-6">
                <VerificationPanel claimId={id} capacity={capacity} />
              </div>
            ) : null}

            {underVerification && capacity && alreadyDecided ? (
              <p className="border-t border-nid-border pt-4 text-sm text-muted-foreground">
                Keputusan Anda pada siklus {cpar.cycle} sudah tercatat. Menunggu{" "}
                {progress.pending.length} kapasitas lain.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {verifications.some((entry) => entry.cycle < cpar.cycle) ? (
        <Card>
          <CardHeader>
            <CardTitle>Riwayat siklus</CardTitle>
            <CardDescription>
              Keputusan siklus sebelumnya tidak pernah dihapus — inilah alasan CPAR ini berbentuk
              seperti sekarang.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VerificationHistory verifications={verifications} cycle={cpar.cycle} />
          </CardContent>
        </Card>
      ) : null}

      {documents.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Dokumen CPAR</CardTitle>
            <CardDescription>
              Dicetak per siklus. Lembar sebelum approval diberi watermark DRAFT.
            </CardDescription>
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
                    {DOCUMENT_TITLE.CPAR}
                  </a>

                  <span className="text-xs tabular text-muted-foreground">
                    siklus {document.cycle} · v{document.version}
                  </span>

                  {document.isDraft ? (
                    <span className="rounded-full bg-[var(--status-draft-bg)] px-2 py-0.5 text-[11px] text-[var(--status-draft)]">
                      DRAFT
                    </span>
                  ) : null}

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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm">{value || "—"}</dd>
    </div>
  );
}
