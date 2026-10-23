import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { CheckCircle2, Clock, TriangleAlert } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { verifyMailer } from "@/lib/mailer";
import { can } from "@/lib/permissions";
import { getPortalUser } from "@/lib/session";
import { NOTIFICATION_LABEL } from "@/emails/types";

export const metadata: Metadata = {
  title: "Notifications",
};

export const dynamic = "force-dynamic";

/**
 * Log pengiriman email (§8).
 *
 * Bukan kotak masuk pengguna, melainkan catatan apa yang portal kirim, kepada siapa,
 * dan apakah berhasil — supaya "emailnya tidak sampai" dapat ditelusuri alih-alih
 * diperdebatkan.
 */
export default async function NotificationsPage() {
  const user = await getPortalUser();

  if (!can(user, "notification.viewLog")) forbidden();

  const [notifications, counts, smtpReachable] = await Promise.all([
    db.notification.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { claim: { select: { id: true, claimNo: true } } },
    }),
    db.notification.groupBy({ by: ["status"], _count: { _all: true } }),
    verifyMailer(),
  ]);

  const countFor = (status: string) =>
    counts.find((entry) => entry.status === status)?._count._all ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold text-nid-orange-700">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          Catatan email yang dikirim portal. Empat belas jenis notifikasi pada §8 dibangun bertahap
          mengikuti modulnya.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Terkirim" value={countFor("SENT")} tone="closed" icon={CheckCircle2} />
        <StatCard label="Dalam antrean" value={countFor("QUEUED")} tone="pending" icon={Clock} />
        <StatCard label="Gagal" value={countFor("FAILED")} tone="danger" icon={TriangleAlert} />
      </div>

      {!smtpReachable ? (
        <p className="rounded-xl border border-nid-border bg-[var(--status-pending-bg)] px-4 py-3 text-sm">
          Server SMTP di <code className="text-xs">{process.env.SMTP_HOST}:{process.env.SMTP_PORT}</code>{" "}
          tidak dapat dihubungi. Email baru akan tercatat sebagai gagal sampai layanannya menyala.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>50 notifikasi terakhir</CardTitle>
          <CardDescription>
            Kunci idempotensi menjaga satu jenis notifikasi tidak terkirim dua kali untuk peristiwa
            yang sama.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {notifications.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">Belum ada email yang dikirim.</p>
          ) : (
            <ul className="divide-y divide-nid-border">
              {notifications.map((notification) => (
                <li key={notification.id} className="space-y-1 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <StatusDot status={notification.status} />
                    <span className="text-sm font-medium">
                      {NOTIFICATION_LABEL[notification.type]}
                    </span>
                    {notification.claim?.claimNo ? (
                      <Link
                        href={`/claims/${notification.claim.id}`}
                        className="text-sm tabular text-nid-orange-700 hover:underline"
                      >
                        {notification.claim.claimNo}
                      </Link>
                    ) : null}
                    <span className="ml-auto text-xs tabular text-muted-foreground">
                      {formatDateTime(notification.sentAt ?? notification.createdAt)}
                    </span>
                  </div>

                  <p className="text-sm text-muted-foreground">{notification.subject}</p>

                  <p className="text-xs text-muted-foreground">
                    Kepada {notification.recipients.length} penerima
                    {notification.ccRecipients.length > 0
                      ? `, cc ${notification.ccRecipients.length}`
                      : ""}
                    {notification.attachmentPaths.length > 0
                      ? ` · ${notification.attachmentPaths.length} lampiran`
                      : ""}
                    {notification.attempts > 1 ? ` · ${notification.attempts} percobaan` : ""}
                  </p>

                  {notification.errorMessage ? (
                    <p className="rounded-md bg-[var(--status-danger-bg)] px-3 py-2 text-xs text-destructive">
                      {notification.errorMessage}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: "closed" | "pending" | "danger";
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-lg"
          style={{
            backgroundColor: `var(--status-${tone}-bg)`,
            color: `var(--status-${tone})`,
          }}
        >
          <Icon aria-hidden className="size-4" />
        </span>
        <span>
          <span className="block text-xl font-semibold tabular">{value}</span>
          <span className="block text-xs text-muted-foreground">{label}</span>
        </span>
      </CardContent>
    </Card>
  );
}

function StatusDot({ status }: { status: string }) {
  const tone = status === "SENT" ? "closed" : status === "FAILED" ? "danger" : "pending";

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: `var(--status-${tone}-bg)`, color: `var(--status-${tone})` }}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
