import { Sidebar } from "@/components/shared/sidebar";
import { Topbar } from "@/components/shared/topbar";
import { getPortalUser } from "@/lib/session";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getPortalUser();

  // FASE 7 mengganti angka-angka ini dengan hitungan "butuh tindakan saya" dari database.
  const badgeCounts = {};

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar roles={user.roles} badgeCounts={badgeCounts} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} />
        <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
