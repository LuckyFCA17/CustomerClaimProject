import { createTransport, type Transporter } from "nodemailer";

/**
 * Satu-satunya jalan keluar email dari portal (§8).
 *
 * Pengiriman sengaja dipisah dari penulisan basis data: baris Notification ditulis di
 * dalam transaksi perpindahan status, sedangkan pengirimannya terjadi sesudah commit.
 * Dengan begitu SMTP yang sedang mati tidak membatalkan perubahan status, dan
 * sebaliknya transaksi yang di-rollback tidak menyisakan email yang terlanjur keluar.
 */

export interface MailAttachment {
  readonly filename: string;
  readonly path?: string;
  readonly content?: Buffer;
  readonly contentType?: string;
}

export interface MailMessage {
  readonly to: readonly string[];
  readonly cc?: readonly string[];
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly attachments?: readonly MailAttachment[];
}

let cached: Transporter | null = null;

function transporter(): Transporter {
  if (cached) return cached;

  const host = process.env.SMTP_HOST;
  if (!host) {
    throw new Error("SMTP_HOST belum diset. Salin .env.example ke .env terlebih dahulu.");
  }

  const port = Number(process.env.SMTP_PORT ?? 1025);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  cached = createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true",
    // MailHog dan penangkap email lain berjalan tanpa autentikasi; kredensial hanya
    // dipasang bila memang diisi, karena nodemailer menolak objek auth yang kosong.
    ...(user ? { auth: { user, pass } } : {}),
    // Pengembangan memakai SMTP lokal tanpa sertifikat tepercaya.
    ...(process.env.NODE_ENV === "production" ? {} : { tls: { rejectUnauthorized: false } }),
  });

  return cached;
}

export function mailFrom(): string {
  return process.env.MAIL_FROM ?? "NCC Portal <ncc-portal@nifco.co.id>";
}

export async function sendMail(message: MailMessage): Promise<string> {
  if (message.to.length === 0 && (message.cc?.length ?? 0) === 0) {
    throw new Error("Email tanpa penerima tidak dikirim.");
  }

  const info = await transporter().sendMail({
    from: mailFrom(),
    to: [...message.to],
    cc: message.cc ? [...message.cc] : undefined,
    subject: message.subject,
    html: message.html,
    text: message.text,
    attachments: message.attachments?.map((attachment) => ({
      filename: attachment.filename,
      path: attachment.path,
      content: attachment.content,
      contentType: attachment.contentType,
    })),
  });

  return String(info.messageId ?? "");
}

/** Memastikan SMTP dapat dihubungi — dipakai halaman log notifikasi dan worker. */
export async function verifyMailer(): Promise<boolean> {
  try {
    await transporter().verify();
    return true;
  } catch {
    return false;
  }
}
