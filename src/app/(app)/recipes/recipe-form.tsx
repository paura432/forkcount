"use client";

import { useFieldArray, useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useMemo, useTransition } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { createRecipe, updateRecipe } from "./actions";
import type { Ingredient } from "@/types/ingredient";
import type { LaborRole } from "@/types/recipe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoneyEUR, unitLabel } from "@/lib/format";
import { recipeCostBreakdown, recipeCostSummary } from "@/lib/costs";
import { defaultRecipeQuantityUnit } from "@/lib/recipe-units";
import { quantityUnitOptionsForCatalog } from "@/lib/recipe-unit-options";
import { RecipeCostSummaryBlock } from "@/components/recipes/recipe-cost-summary-block";
import type { IngredientUnit, RecipeLaborLineResolved } from "@/lib/types";
import { Plus, Trash2 } from "lucide-react";

const itemSchema = z.object({
  ingredient_id: z.string().uuid("Elige ingrediente"),
  quantity: z.coerce.number().positive(),
  quantity_unit: z.enum(["g", "kg", "ml", "l", "ud"]),
  ingredient_yield_percentage: z.coerce.number().min(1).max(100),
});

const laborRowSchema = z.object({
  labor_role_id: z.string().uuid("Elige rol"),
  minutes: z.coerce.number().positive(),
  notes: z.string().optional(),
});

const schema = z.object({
  name: z.string().min(1, "Nombre obligatorio"),
  description: z.string().optional(),
  servings: z.coerce.number().int().min(1, "Mínimo 1 ración"),
  selling_price: z.string().optional(),
  items: z.array(itemSchema).min(1, "Añade al menos un ingrediente"),
  labor: z.array(laborRowSchema).default([]),
});

type FormValues = z.infer<typeof schema>;

function priceMapToMap(priceMap: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(priceMap));
}

function ingredientUnitMap(ingredients: Ingredient[]): Map<string, IngredientUnit> {
  return new Map(ingredients.map((i) => [i.id, i.unit]));
}

export function RecipeForm({
  ingredients,
  priceMap,
  laborRoles,
  mode,
  recipeId,
  defaultValues,
  onDone,
}: {
  ingredients: Ingredient[];
  priceMap: Record<string, number>;
  laborRoles: LaborRole[];
  mode: "create" | "edit";
  recipeId?: string;
  defaultValues?: Partial<FormValues>;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
      defaultValues: defaultValues ?? {
      name: "",
      description: "",
      servings: 1,
      selling_price: "",
      items:
        ingredients[0] != null
          ? [
              {
                ingredient_id: ingredients[0].id,
                quantity: 1,
                quantity_unit: defaultRecipeQuantityUnit(ingredients[0].unit),
                ingredient_yield_percentage: 100,
              },
            ]
          : [],
      labor: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const laborFieldArray = useFieldArray({
    control: form.control,
    name: "labor",
  });

  const watchedItemsRaw = useWatch({
    control: form.control,
    name: "items",
  });
  const watchedItems = useMemo(
    () =>
      (Array.isArray(watchedItemsRaw) ? watchedItemsRaw : []) as {
        ingredient_id: string;
        quantity: number;
        quantity_unit: IngredientUnit;
        ingredient_yield_percentage: number;
      }[],
    [watchedItemsRaw],
  );

  const watchedLaborRaw = useWatch({
    control: form.control,
    name: "labor",
  });
  const watchedLabor = useMemo(
    () =>
      (Array.isArray(watchedLaborRaw) ? watchedLaborRaw : []) as {
        labor_role_id: string;
        minutes: number;
        notes?: string;
      }[],
    [watchedLaborRaw],
  );

  const watchedServings = useWatch({
    control: form.control,
    name: "servings",
    defaultValue: 1,
  });

  const watchedSellingStr = useWatch({
    control: form.control,
    name: "selling_price",
    defaultValue: "",
  });

  const unitById = useMemo(() => ingredientUnitMap(ingredients), [ingredients]);
  const priceById = useMemo(() => priceMapToMap(priceMap), [priceMap]);

  const linesForCost = useMemo(
    () =>
      watchedItems.map((it) => ({
        ingredient_id: it.ingredient_id,
        quantity: Number(it.quantity) || 0,
        quantity_unit: it.quantity_unit ?? unitById.get(it.ingredient_id) ?? "g",
        ingredient_yield_percentage:
          Number(it.ingredient_yield_percentage) || 100,
      })),
    [watchedItems, unitById]
  );

  const laborResolved = useMemo((): RecipeLaborLineResolved[] | null => {
    if (watchedLabor.length === 0) return [];
    const out: { minutes: number; hourly_cost: number }[] = [];
    for (const row of watchedLabor) {
      const role = laborRoles.find((r) => r.id === row.labor_role_id);
      const hc = role != null ? Number(role.hourly_cost) : NaN;
      const min = Number(row.minutes);
      if (!role || !Number.isFinite(hc) || hc < 0) return null;
      if (!Number.isFinite(min) || min <= 0) return null;
      out.push({ minutes: min, hourly_cost: hc });
    }
    return out;
  }, [watchedLabor, laborRoles]);

  const sellingParsed = useMemo(() => {
    const t = String(watchedSellingStr ?? "").trim();
    if (t === "") return null;
    const n = Number(t.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }, [watchedSellingStr]);

  const servingsNum = Math.max(1, Number(watchedServings) || 1);

  const breakdown = useMemo(
    () => recipeCostBreakdown(linesForCost, unitById, priceById),
    [linesForCost, unitById, priceById]
  );

  const summary = useMemo(
    () =>
      recipeCostSummary(
        linesForCost,
        unitById,
        priceById,
        laborResolved,
        servingsNum,
        sellingParsed
      ),
    [linesForCost, unitById, priceById, laborResolved, servingsNum, sellingParsed]
  );

  if (!ingredients.length) {
    return (
      <p className="text-muted-foreground text-sm">
        Crea ingredientes y al menos una compra para estimar costes.
      </p>
    );
  }

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("name", values.name.trim());
      fd.set("description", values.description?.trim() ?? "");
      fd.set("servings", String(values.servings));
      fd.set("items", JSON.stringify(values.items));
      fd.set("labor", JSON.stringify(values.labor ?? []));
      if (values.selling_price != null && String(values.selling_price).trim() !== "") {
        fd.set("selling_price", String(values.selling_price).trim());
      } else {
        fd.set("selling_price", "");
      }
      if (mode === "edit" && recipeId) fd.set("id", recipeId);

      const res =
        mode === "create"
          ? await createRecipe({}, fd)
          : await updateRecipe({}, fd);

      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(mode === "create" ? "Receta creada" : "Receta actualizada");
      if (mode === "create") {
        form.reset({
          name: "",
          description: "",
          servings: 1,
          selling_price: "",
          items: [
            {
              ingredient_id: ingredients[0]!.id,
              quantity: 1,
              quantity_unit: defaultRecipeQuantityUnit(ingredients[0]!.unit),
              ingredient_yield_percentage: 100,
            },
          ],
          labor: [],
        });
      }
      onDone?.();
      router.refresh();
    });
  }

  const firstRoleId = laborRoles[0]?.id;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-8">
      <div className="space-y-2">
        <Label htmlFor="recipe-name">Nombre</Label>
        <Input id="recipe-name" className="min-h-11" {...form.register("name")} />
        {form.formState.errors.name ? (
          <p className="text-destructive text-xs">{form.formState.errors.name.message}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="recipe-desc">Descripción (opcional)</Label>
        <Input id="recipe-desc" className="min-h-11" {...form.register("description")} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="recipe-servings">Raciones (porciones)</Label>
          <Input
            id="recipe-servings"
            type="number"
            min={1}
            step={1}
            className="min-h-11"
            {...form.register("servings")}
          />
          {form.formState.errors.servings ? (
            <p className="text-destructive text-xs">{form.formState.errors.servings.message}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="recipe-pvp">PVP por ración (€, opcional)</Label>
          <Input
            id="recipe-pvp"
            type="text"
            inputMode="decimal"
            className="min-h-11"
            placeholder="—"
            {...form.register("selling_price")}
          />
        </div>
      </div>

      <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
        <h2 className="text-base font-semibold tracking-tight">Ingredientes</h2>
        <div className="flex items-center justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-10"
            onClick={() =>
              append({
                ingredient_id: ingredients[0]!.id,
                quantity: 1,
                quantity_unit: defaultRecipeQuantityUnit(ingredients[0]!.unit),
                ingredient_yield_percentage: 100,
              })
            }
          >
            <Plus className="size-4" />
            Añadir línea
          </Button>
        </div>
        <div className="flex flex-col gap-3">
          {fields.map((field, index) => {
            const ingId = watchedItems[index]?.ingredient_id;
            const ing = ingredients.find((i) => i.id === ingId);
            const bdLine = breakdown.lines[index];
            const catalogUnit = ing?.unit ?? "g";
            const unitOpts = quantityUnitOptionsForCatalog(catalogUnit);
            const lastPrice = ingId ? priceMap[ingId] : undefined;
            const lineNaive =
              bdLine?.line_cost_naive != null ? formatMoneyEUR(bdLine.line_cost_naive) : "—";
            const lineFinal =
              bdLine?.line_cost != null ? formatMoneyEUR(bdLine.line_cost) : "—";
            return (
              <div
                key={field.id}
                className="bg-background grid gap-2 rounded-md border p-3 sm:grid-cols-12 sm:items-end"
              >
                <div className="sm:col-span-3">
                  <Label className="text-xs">Ingrediente</Label>
                  <select
                    className="border-input mt-1 flex min-h-11 w-full rounded-lg border px-2 text-sm"
                    {...form.register(`items.${index}.ingredient_id`, {
                      onChange: (e) => {
                        const next = ingredients.find((i) => i.id === e.target.value);
                        if (next) {
                          form.setValue(
                            `items.${index}.quantity_unit`,
                            defaultRecipeQuantityUnit(next.unit),
                          );
                        }
                      },
                    })}
                  >
                    {ingredients.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({unitLabel(i.unit)})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Cantidad</Label>
                  <Input
                    type="number"
                    step="any"
                    min={0}
                    className="mt-1 min-h-11"
                    {...form.register(`items.${index}.quantity`)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Unidad</Label>
                  <select
                    className="border-input mt-1 flex min-h-11 w-full rounded-lg border px-2 text-sm"
                    {...form.register(`items.${index}.quantity_unit`)}
                  >
                    {unitOpts.map((u) => (
                      <option key={u} value={u}>
                        {unitLabel(u)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Aprovech. %</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    className="mt-1 min-h-11"
                    {...form.register(`items.${index}.ingredient_yield_percentage`)}
                  />
                </div>
                <div className="sm:col-span-3">
                  <p className="text-muted-foreground text-xs">
                    Último precio:{" "}
                    {lastPrice != null
                      ? `${formatMoneyEUR(lastPrice)}/${unitLabel(catalogUnit)}`
                      : "Sin precio de compra"}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Sin merma: <span className="text-foreground tabular-nums">{lineNaive}</span>
                  </p>
                  <p className="text-xs font-medium tabular-nums">Con merma: {lineFinal}</p>
                </div>
                <div className="flex sm:col-span-1 sm:justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive min-h-11 min-w-11"
                    disabled={fields.length <= 1}
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold tracking-tight">Manufactura</h2>
          {laborRoles.length === 0 ? (
            <Link href="/labor-roles" className="text-primary text-sm underline">
              Crear roles de mano de obra
            </Link>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">
          Coste de mano de obra = minutos / 60 × coste horario real (salario + seguros + cargas /
          horas productivas).
        </p>
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-10"
            disabled={!firstRoleId}
            onClick={() =>
              laborFieldArray.append({
                labor_role_id: firstRoleId!,
                minutes: 15,
                notes: "",
              })
            }
          >
            <Plus className="size-4" />
            Añadir tiempo
          </Button>
        </div>
        <div className="flex flex-col gap-3">
          {laborFieldArray.fields.map((lf, lix) => {
            const row = watchedLabor[lix];
            const role = laborRoles.find((r) => r.id === row?.labor_role_id);
            const min = Number(row?.minutes) || 0;
            const sub =
              role != null && min > 0
                ? formatMoneyEUR((min / 60) * Number(role.hourly_cost))
                : "—";
            return (
              <div
                key={lf.id}
                className="bg-background grid gap-2 rounded-md border p-3 sm:grid-cols-12 sm:items-end"
              >
                <div className="sm:col-span-3">
                  <Label className="text-xs">Rol</Label>
                  <select
                    className="border-input mt-1 flex min-h-11 w-full rounded-lg border px-2 text-sm"
                    {...form.register(`labor.${lix}.labor_role_id`)}
                  >
                    {laborRoles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({formatMoneyEUR(r.hourly_cost)}/h)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Minutos</Label>
                  <Input
                    type="number"
                    step="any"
                    min={0}
                    className="mt-1 min-h-11"
                    {...form.register(`labor.${lix}.minutes`)}
                  />
                </div>
                <div className="sm:col-span-4">
                  <Label className="text-xs">Notas (opcional)</Label>
                  <Input className="mt-1 min-h-11" {...form.register(`labor.${lix}.notes`)} />
                </div>
                <div className="sm:col-span-1">
                  <p className="text-muted-foreground text-xs">Subtotal</p>
                  <p className="mt-2 font-medium tabular-nums">{sub}</p>
                </div>
                <div className="flex sm:col-span-1 sm:justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive min-h-11 min-w-11"
                    onClick={() => laborFieldArray.remove(lix)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })}
          {laborFieldArray.fields.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sin tiempos de elaboración.</p>
          ) : null}
        </div>
      </section>

      <RecipeCostSummaryBlock summary={summary} />

      <Button type="submit" className="min-h-11 w-full" disabled={pending}>
        {pending ? "Guardando…" : mode === "create" ? "Crear receta" : "Guardar cambios"}
      </Button>
    </form>
  );
}
