import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { CatalogManager, type CatalogRow } from "@/components/master/catalog-manager";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CATALOGS, isCatalogSlug, type CatalogSlug } from "@/lib/master-catalog";
import { loadCatalogRows } from "@/server/master-catalog";

/**
 * Satu halaman untuk keenam daftar acuan.
 *
 * Segmen dinamis ini tidak menelan /master/users dan /master/departments: Next selalu
 * mendahulukan segmen statis, dan slug yang tidak dikenal berakhir di notFound().
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ catalog: string }>;
}): Promise<Metadata> {
  const { catalog } = await params;

  return {
    title: isCatalogSlug(catalog) ? `${CATALOGS[catalog].title} · Master Data` : "Master Data",
  };
}

export default async function CatalogPage({
  params,
}: {
  params: Promise<{ catalog: string }>;
}) {
  const { catalog } = await params;
  if (!isCatalogSlug(catalog)) notFound();

  const definition = CATALOGS[catalog as CatalogSlug];
  const rows: CatalogRow[] = await loadCatalogRows(catalog as CatalogSlug);
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
        <h1 className="font-display text-2xl font-bold text-nid-orange-700">
          {definition.title}
        </h1>
        <p className="text-sm text-muted-foreground">{definition.description}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>
            {active} aktif dari {rows.length} baris
          </CardTitle>
          <CardDescription>
            Tidak ada penghapusan — baris yang sudah terpakai tertinggal di klaim dan CPAR lama.
            {" "}
            {definition.inactiveHint}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CatalogManager definition={definition} rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
