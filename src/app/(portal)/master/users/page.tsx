import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import {
  UserManager,
  type DepartmentOption,
  type UserRow,
} from "@/components/master/user-manager";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Pengguna · Master Data",
};

export default async function UsersPage() {
  const [users, departments] = await Promise.all([
    db.user.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        jobTitle: true,
        employeeNo: true,
        departmentId: true,
        isActive: true,
        department: { select: { code: true } },
        roles: { select: { role: { select: { code: true } } } },
      },
    }),
    db.department.findMany({
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, isActive: true },
    }),
  ]);

  const rows: UserRow[] = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    jobTitle: user.jobTitle,
    employeeNo: user.employeeNo,
    departmentId: user.departmentId,
    departmentCode: user.department?.code ?? null,
    roles: user.roles.map((entry) => entry.role.code),
    isActive: user.isActive,
  }));

  const options: DepartmentOption[] = departments;
  const active = rows.filter((row) => row.isActive).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/master"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft aria-hidden className="size-3.5" />
          Master Data
        </Link>
        <h1 className="font-display text-2xl font-bold text-nid-orange-700">Pengguna & role</h1>
        <p className="text-sm text-muted-foreground">
          Role menentukan siapa boleh mengisi section CPAR, memutuskan verifikasi, dan menilai
          efektivitas CAPA.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>
            {active} aktif dari {rows.length} pengguna
          </CardTitle>
          <CardDescription>
            Pengguna tidak dapat dihapus — namanya tertinggal pada klaim yang ia buat dan pada
            blok tanda tangan yang ia setujui. Yang dinonaktifkan tidak dapat masuk portal dan
            berhenti menerima notifikasi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UserManager rows={rows} departments={options} />
        </CardContent>
      </Card>
    </div>
  );
}
