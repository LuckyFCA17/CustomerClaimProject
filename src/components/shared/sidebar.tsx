"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { isNavItemActive, navItemsFor, type RoleCode } from "@/config/navigation";
import { NidMark } from "@/components/shared/nid-mark";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type BadgeCounts = Partial<Record<"claims" | "cpar" | "monitoring" | "notifications", number>>;

/**
 * Sidebar oranye penuh setinggi layar, lebar 260px, collapsible ke ikon (§10).
 * Angka di kanan menu adalah jumlah item yang menunggu tindakan pengguna ini.
 */
export function Sidebar({
  roles,
  badgeCounts = {},
}: {
  roles: readonly RoleCode[];
  badgeCounts?: BadgeCounts;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const items = navItemsFor(roles);

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex",
          collapsed ? "w-[76px]" : "w-[260px]",
        )}
      >
        <div className={cn("flex h-16 items-center px-4", collapsed && "justify-center px-0")}>
          <Link href="/dashboard" className="rounded-lg" aria-label="NCC Portal — Dashboard">
            <NidMark compact={collapsed} />
          </Link>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {items.map((item) => {
            const active = isNavItemActive(item, pathname);
            const count = item.badgeKey ? badgeCounts[item.badgeKey] : undefined;
            const Icon = item.icon;

            const link = (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  "hover:bg-sidebar-hover",
                  active && "bg-sidebar-active",
                  collapsed && "justify-center px-0",
                )}
              >
                {active ? (
                  <span aria-hidden className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-white" />
                ) : null}
                <Icon aria-hidden className="size-[18px] shrink-0" />
                {collapsed ? null : <span className="flex-1 truncate">{item.label}</span>}
                {!collapsed && count ? (
                  <span className="rounded-full bg-nid-badge px-2 py-0.5 text-[11px] font-semibold text-nid-badge-ink">
                    {count}
                  </span>
                ) : null}
                {collapsed && count ? (
                  <span
                    aria-hidden
                    className="absolute right-3 top-1.5 size-2 rounded-full bg-nid-badge ring-2 ring-sidebar"
                  />
                ) : null}
              </Link>
            );

            if (!collapsed) return link;

            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">
                  {item.label}
                  {count ? ` (${count})` : ""}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-expanded={!collapsed}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-hover",
              collapsed && "justify-center px-0",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden className="size-[18px]" />
            ) : (
              <PanelLeftClose aria-hidden className="size-[18px]" />
            )}
            <span className={cn(collapsed && "sr-only")}>Collapse menu</span>
          </button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
