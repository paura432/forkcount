"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Truck,
  Carrot,
  Receipt,
  ChefHat,
  Settings,
  UserCog,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { getPageHeader } from "@/components/layout/get-page-header";

const NAV = [
  { href: "/dashboard", label: "Panel", icon: LayoutDashboard },
  { href: "/suppliers", label: "Prov.", icon: Truck },
  { href: "/ingredients", label: "Ingr.", icon: Carrot },
  { href: "/labor-roles", label: "Roles", icon: UserCog },
  { href: "/purchases", label: "Compras", icon: Receipt },
  { href: "/recipes", label: "Recetas", icon: ChefHat },
  { href: "/settings", label: "Ajustes", icon: Settings },
] as const;

function NavLinks({
  onNavigate,
  className,
  variant = "sidebar",
}: {
  onNavigate?: () => void;
  className?: string;
  variant?: "sidebar" | "bottom";
}) {
  const pathname = usePathname();
  return (
    <nav
      className={cn(
        variant === "sidebar" && "flex flex-col gap-1",
        variant === "bottom" && "flex w-full items-stretch justify-around gap-0.5",
        className
      )}
    >
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const sidebarNavItemClass = cn(
          "w-full h-12 rounded-2xl px-4 box-border border transition-colors",
          "grid grid-cols-[20px_1fr] items-center gap-3",
          active
            ? "border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground dark:border-white/70 dark:bg-white/10 dark:text-white"
            : "border-transparent text-sidebar-foreground hover:bg-sidebar-accent/80 dark:text-white/80 dark:hover:bg-white/5",
        );
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              variant === "sidebar" && sidebarNavItemClass,
              variant === "bottom" &&
                cn(
                  "flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium leading-tight transition-colors sm:text-xs",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted/80",
                ),
            )}
          >
            <Icon
              className={cn("shrink-0", variant === "sidebar" ? "h-5 w-5" : "size-5")}
              aria-hidden
            />
            <span
              className={cn(
                variant === "sidebar" && "truncate text-left text-sm font-medium leading-none",
                variant === "bottom" && "max-w-[4.5rem] truncate text-center",
              )}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  children,
  email,
}: {
  children: ReactNode;
  email: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const pageHeader = getPageHeader(pathname);

  async function handleLogout() {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(error.message);
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-svh w-full flex-col bg-background md:flex-row">
      <aside className="border-sidebar-border bg-sidebar text-sidebar-foreground hidden w-56 shrink-0 flex-col border-r md:flex">
        <div className="flex h-16 items-center border-b border-sidebar-border px-4">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            Forkcount
          </Link>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3">
          <NavLinks variant="sidebar" />
        </div>
        <Separator className="bg-sidebar-border" />
        <div className="flex flex-col gap-2 p-3">
          {email ? (
            <p className="text-muted-foreground truncate px-1 text-xs">{email}</p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full justify-start gap-2 border-sidebar-border bg-transparent"
            onClick={() => void handleLogout()}
          >
            Cerrar sesión
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          title={pageHeader.title}
          subtitle={pageHeader.subtitle}
          showCreatePurchaseButton={pageHeader.showCreatePurchaseButton}
        />

        <main className="flex-1 p-4 pb-24 md:p-6 md:pb-6">{children}</main>

        <nav
          className="bg-background/95 supports-backdrop-filter:bg-background/80 fixed bottom-0 left-0 right-0 z-40 border-t pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1 backdrop-blur md:hidden"
          aria-label="Principal"
        >
          <NavLinks variant="bottom" />
        </nav>
      </div>
    </div>
  );
}
