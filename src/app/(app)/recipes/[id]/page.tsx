import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRestaurantId } from "@/lib/auth/restaurant";
import { buildRecipeCostSummary } from "@/lib/recipe-cost-build";
import { recipeCostBreakdown } from "@/lib/costs";
import { RecipeEscandalloSheet } from "@/components/recipes/recipe-escandallo-sheet";
import { RecipeForm } from "../recipe-form";
import type { Ingredient } from "@/types/ingredient";
import type { IngredientUnit, LatestUnitPriceRow } from "@/lib/types";
import type { LaborRole } from "@/types/recipe";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const restaurantId = await getRestaurantId();

  const { data: recipe, error: recErr } = await supabase
    .from("recipes")
    .select(
      `id, name, description, servings, selling_price,
      recipe_items(ingredient_id, quantity, quantity_unit, ingredient_yield_percentage),
      recipe_labor_items(labor_role_id, minutes, notes)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (recErr || !recipe) notFound();

  const [ingRes, pricesRes, laborRes] = await Promise.all([
    supabase.from("ingredients").select("*").order("name"),
    supabase.rpc("latest_unit_prices", { p_restaurant_id: restaurantId }),
    supabase.from("labor_roles").select("*").order("name"),
  ]);

  if (ingRes.error || pricesRes.error || laborRes.error) {
    const msg = ingRes.error?.message ?? pricesRes.error?.message ?? laborRes.error?.message;
    return <p className="text-destructive text-sm">Error: {msg}</p>;
  }

  const ingredients = (ingRes.data ?? []) as Ingredient[];
  const unitById = new Map(ingredients.map((i) => [i.id, i.unit]));
  const priceRows = (pricesRes.data ?? []) as LatestUnitPriceRow[];
  const priceMap = Object.fromEntries(
    priceRows.map((p) => [p.ingredient_id, Number(p.unit_price)]),
  );
  const priceById = new Map(
    priceRows.map((p) => [p.ingredient_id, Number(p.unit_price)]),
  );

  const items = (recipe.recipe_items ?? []).map((it) => {
    const catalog = unitById.get(it.ingredient_id) ?? "g";
    const qUnit = (it.quantity_unit ?? catalog) as IngredientUnit;
    return {
      ingredient_id: it.ingredient_id,
      quantity: Number(it.quantity),
      quantity_unit: qUnit,
      ingredient_yield_percentage:
        it.ingredient_yield_percentage != null
          ? Number(it.ingredient_yield_percentage)
          : 100,
    };
  });

  const laborRows = (recipe.recipe_labor_items ?? []).map((r) => ({
    labor_role_id: r.labor_role_id,
    minutes: Number(r.minutes),
    notes: r.notes ?? null,
  }));

  const laborRoles = ((laborRes.data ?? []) as LaborRole[]).map((r) => ({
    ...r,
    hourly_cost: Number(r.hourly_cost),
  }));
  const laborHourly = new Map(laborRoles.map((r) => [r.id, r.hourly_cost]));

  const servings = Number(recipe.servings) >= 1 ? Number(recipe.servings) : 1;
  const selling =
    recipe.selling_price != null && Number.isFinite(Number(recipe.selling_price))
      ? Number(recipe.selling_price)
      : null;

  const linesForCost = items.map((it) => ({
    ingredient_id: it.ingredient_id,
    quantity: it.quantity,
    quantity_unit: it.quantity_unit,
    ingredient_yield_percentage: it.ingredient_yield_percentage,
  }));

  const breakdown = recipeCostBreakdown(linesForCost, unitById, priceById);
  const summary = buildRecipeCostSummary({
    items,
    labor: laborRows.map((r) => ({
      labor_role_id: r.labor_role_id,
      minutes: r.minutes,
    })),
    ingredientUnitById: unitById,
    unitPriceByIngredientId: priceById,
    laborHourlyByRoleId: laborHourly,
    servings,
    selling_price: selling,
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div>
        <Link
          href="/recipes"
          className={cn(buttonVariants({ variant: "ghost" }), "h-auto px-0 text-sm")}
        >
          ← Recetas
        </Link>
        <p className="text-muted-foreground mt-1 text-sm font-medium">{recipe.name}</p>
      </div>

      <RecipeEscandalloSheet
        recipeName={recipe.name}
        servings={servings}
        sellingPrice={selling}
        ingredients={ingredients}
        breakdown={breakdown}
        summary={summary}
        laborRows={laborRows}
        laborRoles={laborRoles}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Editar receta</h2>
        <RecipeForm
          key={recipe.id}
          ingredients={ingredients}
          priceMap={priceMap}
          laborRoles={laborRoles}
          mode="edit"
          recipeId={recipe.id}
          defaultValues={{
            name: recipe.name,
            description: recipe.description ?? "",
            servings,
            selling_price:
              selling != null && Number.isFinite(selling) ? String(selling) : "",
            items: items.map((it) => ({
              ingredient_id: it.ingredient_id,
              quantity: it.quantity,
              quantity_unit: it.quantity_unit,
              ingredient_yield_percentage: it.ingredient_yield_percentage,
            })),
            labor: laborRows.map((r) => ({
              labor_role_id: r.labor_role_id,
              minutes: r.minutes,
              notes: r.notes ?? "",
            })),
          }}
        />
      </section>
    </div>
  );
}
