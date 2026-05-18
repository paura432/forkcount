"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { toast } from "sonner";
import { deleteRecipe } from "./actions";
import type { Ingredient } from "@/types/ingredient";
import type { LaborRole } from "@/types/recipe";
import { RecipeForm } from "./recipe-form";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { formatMoneyEUR } from "@/lib/format";
import type { RecipeProfitabilityStatus } from "@/lib/recipe-profitability";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";

export type RecipeListRow = {
  id: string;
  name: string;
  description: string | null;
  servings: number;
  selling_price: number | null;
  cost: number | null;
  costPerServing: number | null;
  grossMargin: number | null;
  foodCostPct: number | null;
  status: RecipeProfitabilityStatus;
  statusLabel: string;
  recipe_items: {
    ingredient_id: string;
    quantity: number;
    quantity_unit: string;
    ingredient_yield_percentage: number;
  }[];
};

function statusVariant(
  status: RecipeProfitabilityStatus,
): "secondary" | "outline" | "default" | "destructive" {
  switch (status) {
    case "profitable":
      return "default";
    case "tight_margin":
      return "destructive";
    case "no_prices":
      return "outline";
    default:
      return "secondary";
  }
}

export function RecipesClient({
  recipes,
  ingredients,
  priceMap,
  laborRoles,
}: {
  recipes: RecipeListRow[];
  ingredients: Ingredient[];
  priceMap: Record<string, number>;
  laborRoles: LaborRole[];
}) {
  const router = useRouter();
  const [openCreate, setOpenCreate] = useState(false);
  const [pendingDel, startDel] = useTransition();

  const handleDelete = useCallback(
    (id: string) => {
      startDel(async () => {
        const fd = new FormData();
        fd.set("id", id);
        const res = await deleteRecipe(fd);
        if (res && "error" in res && res.error) toast.error(res.error);
        else {
          toast.success("Receta eliminada");
          router.refresh();
        }
      });
    },
    [router]
  );

  const columns = useMemo<ColumnDef<RecipeListRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Nombre",
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.name}</p>
            {row.original.description ? (
              <p className="text-muted-foreground max-w-md truncate text-xs">
                {row.original.description}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "per",
        header: "Coste / ración",
        cell: ({ row }) =>
          row.original.costPerServing == null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="tabular-nums">{formatMoneyEUR(row.original.costPerServing)}</span>
          ),
      },
      {
        id: "pvp",
        header: "PVP",
        cell: ({ row }) =>
          row.original.selling_price == null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="tabular-nums">{formatMoneyEUR(row.original.selling_price)}</span>
          ),
      },
      {
        id: "margin",
        header: "Margen",
        cell: ({ row }) =>
          row.original.grossMargin == null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="tabular-nums">{formatMoneyEUR(row.original.grossMargin)}</span>
          ),
      },
      {
        id: "fcpct",
        header: "% coste",
        cell: ({ row }) =>
          row.original.foodCostPct == null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="tabular-nums">{row.original.foodCostPct.toFixed(1)} %</span>
          ),
      },
      {
        id: "status",
        header: "Estado",
        cell: ({ row }) => (
          <Badge variant={statusVariant(row.original.status)} className="font-normal">
            {row.original.statusLabel}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Acciones</span>,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Link
              href={`/recipes/${row.original.id}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "min-h-9 inline-flex")}
            >
              Ver
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-destructive min-h-9 min-w-9"
              disabled={pendingDel}
              aria-label="Eliminar"
              onClick={() => handleDelete(row.original.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ),
      },
    ],
    [handleDelete, pendingDel]
  );

  const table = useReactTable({
    data: recipes,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex justify-end">
        <Button
          type="button"
          className="min-h-12 shrink-0 gap-2 text-base"
          onClick={() => setOpenCreate(true)}
        >
          <Plus className="size-5" />
          Nueva receta
        </Button>
      </div>

      <ScrollArea className="hidden w-full rounded-lg border md:block">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className={h.column.id === "actions" ? "text-right" : undefined}>
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-muted-foreground py-8 text-center">
                  No hay recetas.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <div className="flex flex-col gap-3 md:hidden">
        {recipes.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">No hay recetas.</p>
        ) : (
          recipes.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-col gap-3 p-4">
                <div>
                  <p className="font-medium">{r.name}</p>
                  {r.description ? (
                    <p className="text-muted-foreground line-clamp-2 text-sm">{r.description}</p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant(r.status)} className="text-xs font-normal">
                      {r.statusLabel}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-sm tabular-nums">
                    Coste/ración:{" "}
                    {r.costPerServing == null ? "—" : formatMoneyEUR(r.costPerServing)}
                    {r.selling_price != null ? ` · PVP ${formatMoneyEUR(r.selling_price)}` : ""}
                  </p>
                  {r.grossMargin != null ? (
                    <p className="text-muted-foreground text-sm tabular-nums">
                      Margen: {formatMoneyEUR(r.grossMargin)}
                      {r.foodCostPct != null ? ` · ${r.foodCostPct.toFixed(1)} % coste` : ""}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/recipes/${r.id}`}
                    className={cn(
                      buttonVariants({ variant: "default" }),
                      "inline-flex min-h-12 flex-1 items-center justify-center text-base"
                    )}
                  >
                    Ver / editar
                  </Link>
                  <Button
                    type="button"
                    variant="destructive"
                    className="min-h-12 flex-1 text-base"
                    disabled={pendingDel}
                    onClick={() => handleDelete(r.id)}
                  >
                    Eliminar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva receta</DialogTitle>
          </DialogHeader>
          <RecipeForm
            ingredients={ingredients}
            priceMap={priceMap}
            laborRoles={laborRoles}
            mode="create"
            onDone={() => setOpenCreate(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
