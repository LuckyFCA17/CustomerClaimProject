import type { Metadata } from "next";

import { ForbiddenNotice } from "@/components/shared/forbidden-notice";

export const metadata: Metadata = {
  title: "Akses ditolak",
};

/** Tujuan pengalihan middleware saat prefix route-nya terlarang (lihat ROUTE_GUARDS). */
export default function ForbiddenPage() {
  return <ForbiddenNotice />;
}
