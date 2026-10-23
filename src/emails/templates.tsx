import { render } from "@react-email/render";

import type { NotificationType } from "@/generated/prisma/enums";
import { ActionButton, AttachmentNote, EmailShell, Note, Paragraph, SummaryTable } from "@/emails/primitives";
import type { ClaimEmailPayload, RenderedEmail } from "@/emails/types";

/**
 * Template email (§8).
 *
 * Fase 3 mencakup tiga jenis pertama — yang dipicu Modul 1. Sebelas sisanya ditambahkan
 * bersama modulnya masing-masing; `renderClaimEmail` melempar galat untuk jenis yang
 * belum punya template, supaya tidak ada notifikasi yang diam-diam terkirim kosong.
 */

function summaryRows(payload: ClaimEmailPayload) {
  return [
    ["Claim No.", payload.claimNo],
    ["Type of claim", payload.claimType],
    ["Part", `${payload.partName} · ${payload.internalPartNo}`],
    ["Customer part no.", payload.customerPartNo],
    ["Customer", payload.customerName],
    ["Non-conformance detail", payload.ncDetail],
    ["Product category", payload.productCategory],
    ["Date of occurrence", payload.dateOfOccurrence],
    ["Date of received", payload.dateOfReceived],
    ["Quality problem", payload.qualityProblem],
  ] as const;
}

function ClaimReviewRequest({ payload }: { payload: ClaimEmailPayload }) {
  return (
    <EmailShell
      preview={`${payload.claimNo} menunggu review Anda`}
      heading="Claim information menunggu review Anda"
    >
      <Paragraph>
        {payload.actorName} ({payload.actorJobTitle}) mengirim informasi klaim pelanggan dan
        memerlukan keputusan Anda: setujui untuk diterbitkan, atau kembalikan untuk diperbaiki.
      </Paragraph>

      <SummaryTable rows={summaryRows(payload)} />

      <ActionButton href={`${payload.portalUrl}/review`} label="Open in portal" />
      <AttachmentNote names={payload.attachmentNames ?? []} />
    </EmailShell>
  );
}

function ClaimRevisionRequest({ payload }: { payload: ClaimEmailPayload }) {
  return (
    <EmailShell
      preview={`${payload.claimNo} dikembalikan untuk diperbaiki`}
      heading="Claim information dikembalikan untuk diperbaiki"
    >
      <Paragraph>
        {payload.actorName} ({payload.actorJobTitle}) meminta perbaikan sebelum klaim ini
        diterbitkan. Nomor klaim tetap sama setelah Anda mengirimnya kembali.
      </Paragraph>

      {payload.comment ? <Note>{payload.comment}</Note> : null}

      <SummaryTable rows={summaryRows(payload)} />

      <ActionButton href={`${payload.portalUrl}/edit`} label="Open in portal" />
    </EmailShell>
  );
}

function NewCustomerClaim({ payload }: { payload: ClaimEmailPayload }) {
  return (
    <EmailShell
      preview={`Klaim baru ${payload.claimNo} — ${payload.partName}`}
      heading="Klaim pelanggan baru diterbitkan"
    >
      <Paragraph>
        Klaim berikut telah disetujui {payload.actorName} ({payload.actorJobTitle}) dan berlaku
        untuk seluruh pihak terkait. Bad News Information Form dan Quick Information for Abnormal
        Part terlampir.
      </Paragraph>

      <SummaryTable rows={summaryRows(payload)} />

      <ActionButton href={payload.portalUrl} label="Open in portal" />
      <AttachmentNote names={payload.attachmentNames ?? []} />
    </EmailShell>
  );
}

const SUBJECTS: Partial<Record<NotificationType, (payload: ClaimEmailPayload) => string>> = {
  CLAIM_REVIEW_REQUEST: (p) => `[NCC] Review request — ${p.claimNo} (${p.partName})`,
  CLAIM_REVISION_REQUEST: (p) => `[NCC] Revisi diminta — ${p.claimNo} (${p.partName})`,
  NEW_CUSTOMER_CLAIM: (p) => `[NCC] Klaim pelanggan baru — ${p.claimNo} (${p.partName})`,
};

const TEMPLATES: Partial<
  Record<NotificationType, (props: { payload: ClaimEmailPayload }) => React.ReactElement>
> = {
  CLAIM_REVIEW_REQUEST: ClaimReviewRequest,
  CLAIM_REVISION_REQUEST: ClaimRevisionRequest,
  NEW_CUSTOMER_CLAIM: NewCustomerClaim,
};

export function hasTemplate(type: NotificationType): boolean {
  return TEMPLATES[type] !== undefined;
}

export function renderSubject(type: NotificationType, payload: ClaimEmailPayload): string {
  const build = SUBJECTS[type];
  if (!build) throw new Error(`Subject email untuk ${type} belum dibuat.`);

  return build(payload);
}

export async function renderClaimEmail(
  type: NotificationType,
  payload: ClaimEmailPayload,
): Promise<RenderedEmail> {
  const Template = TEMPLATES[type];

  if (!Template) {
    throw new Error(
      `Template email untuk ${type} belum dibuat. Tambahkan di src/emails/templates.tsx sebelum mengantrekannya.`,
    );
  }

  const element = <Template payload={payload} />;

  // Versi teks selalu ikut dikirim: beberapa klien email korporat memblokir HTML,
  // dan pemindai keamanan membaca bagian teksnya.
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);

  return { subject: renderSubject(type, payload), html, text };
}
