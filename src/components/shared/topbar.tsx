"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronRight, LogOut, Menu, Search, UserCog } from "lucide-react";

import { cn } from "@/lib/utils";
import { initialsOf } from "@/lib/format";
import type { PortalUser } from "@/lib/session";
import { logoutAction } from "@/server/actions/auth";
import { isNavItemActive, navItemsFor, ROLE_LABEL } from "@/config/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SEGMENT_LABEL: Record<string, string> = {
  dashboard: "Dashboard",
  claims: "Claims",
  cpar: "CPAR",
  monitoring: "Monitoring",
  notifications: "Notifications",
  master: "Master Data",
  new: "New claim",
  review: "Review",
  verify: "Verification",
};

/** cuid dan id serupa tidak layak dibaca manusia; di breadcrumb diganti kata biasa. */
function isIdSegment(segment: string): boolean {
  return segment.length > 12 && /^[a-z0-9]+$/i.test(segment) && /\d/.test(segment);
}

function breadcrumbFrom(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);

  return segments.map((segment, index) => ({
    href: `/${segments.slice(0, index + 1).join("/")}`,
    label: SEGMENT_LABEL[segment] ?? (isIdSegment(segment) ? "Detail" : segment.toUpperCase()),
    isLast: index === segments.length - 1,
  }));
}

export function Topbar({
  user,
  unreadNotifications = 0,
}: {
  user: PortalUser;
  unreadNotifications?: number;
}) {
  const pathname = usePathname();
  const crumbs = breadcrumbFrom(pathname);
  const mobileItems = navItemsFor(user.roles);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-nid-border bg-card px-4 md:px-6">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Open menu"
          className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-secondary md:hidden"
        >
          <Menu aria-hidden className="size-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {mobileItems.map((item) => (
            <DropdownMenuItem key={item.href} asChild>
              <Link
                href={item.href}
                className={cn(isNavItemActive(item, pathname) && "text-nid-orange-700")}
              >
                <item.icon aria-hidden />
                {item.label}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <nav aria-label="Breadcrumb" className="hidden min-w-0 flex-1 md:block">
        <ol className="flex items-center gap-1.5 text-sm">
          {crumbs.map((crumb) => (
            <li key={crumb.href} className="flex min-w-0 items-center gap-1.5">
              {crumb.isLast ? (
                <span className="truncate font-medium text-foreground">{crumb.label}</span>
              ) : (
                <>
                  <Link href={crumb.href} className="truncate text-muted-foreground hover:text-foreground">
                    {crumb.label}
                  </Link>
                  <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                </>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <div className="relative ml-auto hidden w-64 lg:block">
        <Search aria-hidden className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Cari claim no. atau part no."
          aria-label="Search claims"
          className="pl-9"
        />
      </div>

      <Link
        href="/notifications"
        aria-label={`Notifications${unreadNotifications ? ` (${unreadNotifications} belum dibaca)` : ""}`}
        className="relative ml-auto grid size-9 shrink-0 place-items-center rounded-lg hover:bg-secondary lg:ml-0"
      >
        <Bell aria-hidden className="size-5" />
        {unreadNotifications ? (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-nid-badge px-1 text-[10px] font-semibold text-nid-badge-ink">
            {unreadNotifications > 99 ? "99+" : unreadNotifications}
          </span>
        ) : null}
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex shrink-0 items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-secondary">
          <Avatar>
            <AvatarFallback>{initialsOf(user.name)}</AvatarFallback>
          </Avatar>
          <span className="hidden text-left leading-tight sm:flex sm:flex-col">
            <span className="text-sm font-medium">{user.name}</span>
            <span className="text-xs text-muted-foreground">{user.jobTitle}</span>
          </span>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="font-normal normal-case">
            <span className="text-muted-foreground">Role: </span>
            {user.roles.map((role) => ROLE_LABEL[role]).join(", ")}
            {user.departmentCode ? (
              <>
                <br />
                <span className="text-muted-foreground">Dept: </span>
                {user.departmentCode}
              </>
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/master/users">
              <UserCog aria-hidden />
              Account settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <form action={logoutAction}>
              <button type="submit" className="flex w-full items-center gap-2">
                <LogOut aria-hidden />
                Sign out
              </button>
            </form>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
