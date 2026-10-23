import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Satu tampilan 403 untuk dua jalur yang berbeda: forbidden() dari server component,
 * dan pengalihan middleware ke /forbidden saat prefix route-nya terlarang.
 */
export function ForbiddenNotice() {
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <Card>
        <CardHeader>
          <span className="grid size-10 place-items-center rounded-lg bg-[var(--status-danger-bg)] text-destructive">
            <ShieldAlert aria-hidden className="size-5" />
          </span>
          <CardTitle className="text-lg">403 — Akses ditolak</CardTitle>
          <CardDescription>
            Halaman ini bukan bagian dari tanggung jawab Anda. Bila Anda merasa seharusnya punya
            akses, hubungi Administrator QA untuk memeriksa penetapan role dan departemen Anda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/dashboard">Kembali ke dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
