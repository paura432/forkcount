import Link from "next/link";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Truck, Carrot, Receipt, ChefHat } from "lucide-react";
import { DashboardSpendChart, type SpendPoint } from "./dashboard-spend-chart";

type SpendRow = {
  total_price: number | string;
  purchases:
    | { purchase_date: string }
    | { purchase_date: string }[]
    | null;
};

function firstPurchaseDate(
  p: SpendRow["purchases"]
): string | null {
  if (p == null) return null;
  const o = Array.isArray(p) ? p[0] : p;
  return o?.purchase_date ?? null;
}

function buildSpendByMonth(rows: SpendRow[]): SpendPoint[] {
  const byMonth = new Map<string, number>();
  for (const row of rows) {
    const d = firstPurchaseDate(row.purchases);
    if (!d) continue;
    const key = format(parseISO(d), "yyyy-MM");
    byMonth.set(key, (byMonth.get(key) ?? 0) + Number(row.total_price));
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, total]) => ({
      month: format(parseISO(`${key}-01`), "MMM yyyy", { locale: es }),
      total: Math.round(total * 100) / 100,
    }));
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const [suppliers, ingredients, purchases, recipes, spendRes] = await Promise.all([
    supabase.from("suppliers").select("id", { count: "exact", head: true }),
    supabase.from("ingredients").select("id", { count: "exact", head: true }),
    supabase
      .from("purchases")
      .select("id", { count: "exact", head: true })
      .eq("status", "confirmed"),
    supabase.from("recipes").select("id", { count: "exact", head: true }),
    supabase.from("purchase_items").select(`
      total_price,
      purchases!inner (
        purchase_date,
        status
      )
    `).eq("purchases.status", "confirmed"),
  ]);

  const counts = {
    suppliers: suppliers.count ?? 0,
    ingredients: ingredients.count ?? 0,
    purchases: purchases.count ?? 0,
    recipes: recipes.count ?? 0,
  };

  const chartData =
    spendRes.error ? [] : buildSpendByMonth((spendRes.data ?? []) as SpendRow[]);

  const links = [
    {
      href: "/suppliers",
      title: "Proveedores",
      desc: `${counts.suppliers} registrados`,
      icon: Truck,
    },
    {
      href: "/ingredients",
      title: "Ingredientes",
      desc: `${counts.ingredients} con unidad fija`,
      icon: Carrot,
    },
    {
      href: "/purchases",
      title: "Compras",
      desc: `${counts.purchases} confirmadas (documento opcional)`,
      icon: Receipt,
    },
    {
      href: "/recipes",
      title: "Recetas",
      desc: `${counts.recipes} con coste estimado`,
      icon: ChefHat,
    },
  ] as const;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Gasto por mes</CardTitle>
          <CardDescription>
            Suma de importes de líneas de compras confirmadas, por mes del documento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {spendRes.error ? (
            <p className="text-destructive text-sm">No se pudo cargar el gráfico: {spendRes.error.message}</p>
          ) : (
            <DashboardSpendChart data={chartData} />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {links.map(({ href, title, desc, icon: Icon }) => (
          <Card key={href} className="transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
              <div className="space-y-1">
                <CardTitle className="text-lg">{title}</CardTitle>
                <CardDescription>{desc}</CardDescription>
              </div>
              <Icon className="text-muted-foreground size-8 shrink-0" aria-hidden />
            </CardHeader>
            <div className="px-6 pb-6">
              <Link
                href={href}
                className={buttonVariants({
                  variant: "outline",
                  className: "inline-flex min-h-11 w-full items-center justify-center sm:w-auto",
                })}
              >
                Abrir
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
