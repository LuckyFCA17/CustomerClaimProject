import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/lib/auth.config";
import { routeAllowed } from "@/lib/permissions";

/**
 * Lapis pertama dari tiga lapis RBAC (PLAN §2.5): penjaga route kasar per prefix.
 *
 * Lapis ini sengaja tidak menyentuh database — ia hanya membaca role dari JWT. Keputusan
 * per klaim (mis. USER_DEPT dari departemen lain) ditolak di server action, bukan di sini.
 */
const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login"];

export default auth((req) => {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;
  const session = req.auth;
  const isPublic = PUBLIC_PATHS.includes(pathname);

  if (!session?.user) {
    if (isPublic) return NextResponse.next();

    const loginUrl = new URL("/login", nextUrl);
    // Setelah masuk, pengguna kembali ke halaman yang tadi ia tuju.
    if (pathname !== "/") {
      loginUrl.searchParams.set("callbackUrl", `${pathname}${nextUrl.search}`);
    }

    return NextResponse.redirect(loginUrl);
  }

  if (isPublic) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  if (!routeAllowed(pathname, session.user.roles ?? [])) {
    return NextResponse.redirect(new URL("/forbidden", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Semua route kecuali endpoint Auth.js, aset Next, dan berkas statis.
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
