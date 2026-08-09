import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Akses ditolak",
};

export default function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-xl pt-10">
      <Card>
        <CardHeader>
          <span className="grid size-10 place-items-center rounded-lg bg-[var(--status-danger-bg)] text-destructive">
            <ShieldAlert aria-hidden className="size-5" />
          </span>
          <CardTitle className="text-lg">403 — Akses ditolak</CardTitle>
          <CardDescription>
            Role Anda tidak mencakup halaman ini. Bila Anda merasa seharusnya punya akses,
            hubungi Administrator QA untuk memeriksa penetapan role Anda.
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
