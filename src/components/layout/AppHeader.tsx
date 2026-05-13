"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Plus, Search, UserCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AppHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
  showCreatePurchaseButton?: boolean;
};

export function AppHeader({
  title,
  subtitle,
  actions,
  breadcrumbs,
  showCreatePurchaseButton = true,
}: AppHeaderProps) {
  const showDefaultPurchase =
    showCreatePurchaseButton && actions == null;

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-6">
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        {breadcrumbs ? (
          <div className="mb-0.5 min-w-0 [&_*]:truncate">{breadcrumbs}</div>
        ) : null}
        <h1 className="truncate text-lg font-semibold tracking-tight md:text-xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="text-muted-foreground hidden truncate text-xs leading-tight sm:block md:text-sm">
            {subtitle}
          </p>
        ) : null}
      </div>

      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <div className="hidden w-56 min-w-0 md:block lg:w-64">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              readOnly
              placeholder="Buscar…"
              className="h-8 pl-9"
              aria-label="Buscar (próximamente)"
            />
          </div>
        </div>

        {actions}

        {showDefaultPurchase ? (
          <Link
            href="/purchases/new"
            className={cn(
              buttonVariants({ size: "sm" }),
              "inline-flex min-h-9 shrink-0 items-center gap-2 sm:min-h-8"
            )}
          >
            <Plus className="size-4 shrink-0" aria-hidden />
            <span className="hidden sm:inline">Nueva compra</span>
            <span className="sm:hidden sr-only">Nueva compra</span>
          </Link>
        ) : null}

        <Link
          href="/settings"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-lg" }),
            "size-9 shrink-0 rounded-full"
          )}
        >
          <UserCircle className="size-5 shrink-0" aria-hidden />
          <span className="sr-only">Ajustes de cuenta</span>
        </Link>
      </div>
    </header>
  );
}
