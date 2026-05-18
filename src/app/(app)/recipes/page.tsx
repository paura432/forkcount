import { createClient } from "@/lib/supabase/server";
import { getRestaurantId } from "@/lib/auth/restaurant";
import { buildRecipeCostSummary } from "@/lib/recipe-cost-build";
import {
  recipeProfitabilityStatus,
  PROFITABILITY_LABEL,
} from "@/lib/recipe-profitability";
import { RecipesClient, type RecipeListRow } from "./recipes-client";
import type { Ingredient } from "@/types/ingredient";
import type { IngredientUnit, LatestUnitPriceRow } from "@/lib/types";
import type { LaborRole } from "@/types/recipe";

export default async function RecipesPage() {
  const supabase = await createClient();
  const restaurantId = await getRestaurantId();

  const [recRes, ingRes, pricesRes, laborRes] = await Promise.all([
    supabase
      .from("recipes")
      .select(
        `id, name, description, servings, selling_price,
        recipe_items(ingredient_id, quantity, quantity_unit, ingredient_yield_percentage),
        recipe_labor_items(labor_role_id, minutes)`,
      )
      .order("name"),
    supabase.from("ingredients").select("*").order("name"),
    supabase.rpc("latest_unit_prices", { p_restaurant_id: restaurantId }),
    supabase.from("labor_roles").select("*").order("name"),
  ]);

  if (recRes.error || ingRes.error || pricesRes.error || laborRes.error) {
    const msg =
      recRes.error?.message ??
      ingRes.error?.message ??
      pricesRes.error?.message ??
      laborRes.error?.message;
    return <p className="text-destructive text-sm">Error: {msg}</p>;
  }

  const ingredients = (ingRes.data ?? []) as Ingredient[];
  const unitById = new Map(ingredients.map((i) => [i.id, i.unit]));
  const priceById = new Map(
    ((pricesRes.data ?? []) as LatestUnitPriceRow[]).map((p) => [
      p.ingredient_id,
      Number(p.unit_price),
    ]),
  );
  const laborHourly = new Map(
    ((laborRes.data ?? []) as LaborRole[]).map((r) => [r.id, Number(r.hourly_cost)]),
  );

  const withCosts: RecipeListRow[] = (recRes.data ?? []).map((row) => {
    const servings = Number(row.servings) >= 1 ? Number(row.servings) : 1;
    const selling =
      row.selling_price != null && Number.isFinite(Number(row.selling_price))
        ? Number(row.selling_price)
        : null;
    const items = (row.recipe_items ?? []).map((it) => ({
      ingredient_id: it.ingredient_id,
      quantity: Number(it.quantity),
      quantity_unit: (it.quantity_unit ?? unitById.get(it.ingredient_id) ?? "g") as IngredientUnit,
      ingredient_yield_percentage: Number(it.ingredient_yield_percentage ?? 100),
    }));
    const labor = (row.recipe_labor_items ?? []).map((l) => ({
      labor_role_id: l.labor_role_id,
      minutes: Number(l.minutes),
    }));
    const summary = buildRecipeCostSummary({
      items,
      labor,
      ingredientUnitById: unitById,
      unitPriceByIngredientId: priceById,
      laborHourlyByRoleId: laborHourly,
      servings,
      selling_price: selling,
    });
    const status = recipeProfitabilityStatus(summary);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      servings,
      selling_price: selling,
      cost: summary.total_cost,
      costPerServing: summary.cost_per_serving,
      grossMargin: summary.gross_margin,
      foodCostPct: summary.food_cost_percentage,
      status,
      statusLabel: PROFITABILITY_LABEL[status],
      recipe_items: items,
    };
  });

  const laborRoles = ((laborRes.data ?? []) as LaborRole[]).map((r) => ({
    ...r,
    hourly_cost: Number(r.hourly_cost),
  }));

  const priceMap = Object.fromEntries(priceById);

  return (
    <RecipesClient
      recipes={withCosts}
      ingredients={ingredients}
      priceMap={priceMap}
      laborRoles={laborRoles}
    />
  );
}
