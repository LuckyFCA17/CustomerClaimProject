import { NextResponse } from "next/server";

import { runReminders } from "@/server/claim-notifications";

export const dynamic = "force-dynamic";

/**
 * Pemicu pengingat terjadwal (§8 #6, #8, #12).
 *
 * Sebuah route, bukan proses worker sendiri: di lingkungan sasaran — termasuk Termux —
 * yang pasti berjalan hanyalah server portalnya, dan menambah proses kedua berarti
 * menambah satu hal lagi yang bisa mati diam-diam. Penjadwalnya cukup memanggil alamat
 * ini sekali sehari:
 *
 *   curl -fsS -X POST -H "Authorization: Bearer $REMINDER_TOKEN" http://127.0.0.1:3000/api/reminders
 *
 * Dijalankan berapa kali pun hasilnya sama: `dedupeKey` memuat tanggal hari ini,
 * sehingga email kedua pada hari yang sama tidak pernah diantrekan (§8 kriteria #5).
 *
 * Tanpa REMINDER_TOKEN alamat ini menolak semua panggilan. Gagal tertutup, bukan
 * terbuka: token yang lupa diisi tidak boleh berarti siapa pun boleh memicunya.
 */
export async function POST(request: Request) {
  const token = process.env.REMINDER_TOKEN?.trim();

  if (!token) {
    return NextResponse.json(
      { error: "REMINDER_TOKEN belum diisi di .env, jadi pengingat tidak dapat dipicu." },
      { status: 503 },
    );
  }

  if (!isAuthorized(request, token)) {
    return NextResponse.json({ error: "Token pengingat tidak cocok." }, { status: 401 });
  }

  const result = await runReminders();

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    queued: result,
  });
}

/**
 * Token boleh datang lewat header Authorization atau query string.
 *
 * Header yang benar untuk ini, tetapi beberapa penjadwal sederhana — termasuk
 * termux-job-scheduler — hanya dapat memanggil sebuah URL apa adanya.
 */
function isAuthorized(request: Request, token: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  if (header === `Bearer ${token}`) return true;

  return new URL(request.url).searchParams.get("token") === token;
}
