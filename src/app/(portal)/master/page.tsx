import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ChevronRight, Database, Users } from "lucide-react";

import { CATALOG_LIST } from "@/lib/master-catalog";

export const metadata: Metadata = {
  title: "Master Data",
};

/**
 * Pintu masuk data acuan.
 *
 * Jalur ini dijaga middleware untuk ADMIN saja (ROUTE_GUARDS), jadi halamannya tidak
 * mengulang pemeriksaan role — yang diulang justru di server action, tempat tulisannya
 * benar-benar terjadi.
 *
 * Delapan daftar, dua di antaranya punya aturannya sendiri — departemen dan pengguna
 * menentukan hak akses — sedangkan enam sisanya hanya "kode + nama + aktif" dan dilayani
 * satu halaman yang sama.
 */
export default function MasterPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold text-nid-orange-700">Master Data</h1>
        <p className="text-sm text-muted-foreground">
          Data acuan yang dipakai seluruh portal. Hanya Administrator yang dapat mengubahnya.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <Section
          href="/master/departments"
          icon={Building2}
          title="Departemen"
          hint="Penanggung jawab CPAR dan naungan pengguna"
        />
        <Section
          href="/master/users"
          icon={Users}
          title="Pengguna & role"
          hint="Siapa boleh melihat dan memutuskan apa"
        />

        {CATALOG_LIST.map((catalog) => (
          <Section
            key={catalog.slug}
            href={`/master/${catalog.slug}`}
            icon={Database}
            title={catalog.title}
            hint={catalog.summary}
          />
        ))}
      </div>
    </div>
  );
}

function Section({
  href,
  icon: Icon,
  title,
  hint,
}: {
  href: string;
  icon: typeof Users;
  title: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-nid-border bg-card px-4 py-3.5 transition-colors hover:bg-secondary"
    >
      <Icon aria-hidden className="size-5 shrink-0 text-nid-orange-700" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
