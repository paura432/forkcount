import { createClient } from "@/lib/supabase/server";
import { getRestaurantId } from "@/lib/auth/restaurant";
import { RecipesClient, type RecipeListRow } from "./recipes-client";
import type { Ingredient } from "@/types/ingredient";
import type { LatestUnitPriceRow } from "@/types/purchase";
import type { LaborRole } from "@/types/recipe";

export default async function RecipesPage() {
  const supabase = await createClient();
  const restaurantId = await getRestaurantId();

  const [recRes, ingRes, pricesRes, laborRes] = await Promise.all([
    supabase
      .from("recipes")
      .select("id, name, description, servings, recipe_items(ingredient_id, quantity)")
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

  const priceRows = (pricesRes.data ?? []) as LatestUnitPriceRow[];
  const priceMap = Object.fromEntries(
    priceRows.map((p) => [p.ingredient_id, Number(p.unit_price)])
  );

  const rawRecipes = recRes.data ?? [];
  const withCosts: RecipeListRow[] = await Promise.all(
    rawRecipes.map(async (row: (typeof rawRecipes)[number]) => {
      const { data: costData } = await supabase.rpc("recipe_total_cost", {
        p_recipe_id: row.id,
      });
      const items = (row.recipe_items ?? []) as {
        ingredient_id: string;
        quantity: number;
      }[];
      const servings = Number(row.servings) >= 1 ? Number(row.servings) : 1;
      const costNum = costData == null ? null : Number(costData);
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        servings,
        cost: costNum,
        costPerServing:
          costNum != null && servings > 0 ? costNum / servings : null,
        recipe_items: items,
      };
    })
  );

  const laborRoles = ((laborRes.data ?? []) as LaborRole[]).map((r) => ({
    ...r,
    hourly_cost: Number(r.hourly_cost),
  }));

  return (
    <RecipesClient
      recipes={withCosts}
      ingredients={(ingRes.data ?? []) as Ingredient[]}
      priceMap={priceMap}
      laborRoles={laborRoles}
    />
  );
}
