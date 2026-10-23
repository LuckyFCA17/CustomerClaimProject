import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Token sekali pakai untuk halaman /print/*.
 *
 * Puppeteer membuka halaman cetak sebagai peramban terpisah yang tidak membawa cookie
 * sesi pengguna. Alih-alih membuka halaman itu untuk siapa saja, server menandatangani
 * tautan berumur pendek untuk satu dokumen dan satu klaim.
 */

const TTL_MS = 2 * 60 * 1000;

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET belum diset; token cetak tidak dapat ditandatangani.");

  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createPrintToken(doc: string, claimId: string, now = Date.now()): string {
  const expiresAt = now + TTL_MS;
  const payload = `${doc}:${claimId}:${expiresAt}`;

  return `${expiresAt}.${sign(payload)}`;
}

export function verifyPrintToken(
  token: string | null,
  doc: string,
  claimId: string,
  now = Date.now(),
): boolean {
  if (!token) return false;

  const [expiresRaw, signature] = token.split(".");
  if (!expiresRaw || !signature) return false;

  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < now) return false;

  const expected = sign(`${doc}:${claimId}:${expiresAt}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  // Panjang yang berbeda membuat timingSafeEqual melempar, jadi diperiksa lebih dulu.
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
