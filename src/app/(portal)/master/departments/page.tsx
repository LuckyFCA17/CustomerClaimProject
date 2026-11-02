import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { DepartmentManager, type DepartmentRow } from "@/components/master/department-manager";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Departemen · Master Data",
};

export default async function DepartmentsPage() {
  const departments = await db.department.findMany({
    orderBy: [{ isActive: "desc" }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      email: true,
      isActive: true,
      _count: { select: { users: true, responsibleCpars: true } },
    },
  });

  const rows: DepartmentRow[] = departments.map((department) => ({
    id: department.id,
    code: department.code,
    name: department.name,
    email: department.email,
    isActive: department.isActive,
    userCount: department._count.users,
    cparCount: department._count.responsibleCpars,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/master"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft aria-hidden className="size-3.5" />
          Master Data
        </Link>
        <h1 className="font-display text-2xl font-bold text-nid-orange-700">Departemen</h1>
        <p className="text-sm text-muted-foreground">
          Menentukan siapa menjadi penanggung jawab CPAR, dan klaim mana yang terlihat oleh
          pengguna departemen.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{rows.length} departemen</CardTitle>
          <CardDescription>
            Departemen tidak dapat dihapus — namanya tertinggal pada CPAR yang sudah disetujui.
            Yang dinonaktifkan hilang dari pilihan baru, tetapi tetap terbaca pada klaim lama.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DepartmentManager rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
