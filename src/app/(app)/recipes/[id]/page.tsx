import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRestaurantId } from "@/lib/auth/restaurant";
import { RecipeForm } from "../recipe-form";
import type { Ingredient } from "@/types/ingredient";
import type { LaborRole } from "@/types/recipe";
import type { LatestUnitPriceRow } from "@/types/purchase";
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
      "id, name, description, servings, selling_price, recipe_items(ingredient_id, quantity, ingredient_yield_percentage), recipe_labor_items(labor_role_id, minutes, notes)"
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

  const priceRows = (pricesRes.data ?? []) as LatestUnitPriceRow[];
  const priceMap = Object.fromEntries(
    priceRows.map((p) => [p.ingredient_id, Number(p.unit_price)])
  );

  const items = (recipe.recipe_items ?? []) as {
    ingredient_id: string;
    quantity: number;
    ingredient_yield_percentage?: number;
  }[];
  const laborRows = (recipe.recipe_labor_items ?? []) as {
    labor_role_id: string;
    minutes: number;
    notes: string | null;
  }[];

  const servings = Number(recipe.servings) >= 1 ? Number(recipe.servings) : 1;
  const selling =
    recipe.selling_price != null && Number.isFinite(Number(recipe.selling_price))
      ? Number(recipe.selling_price)
      : null;

  const laborRoles = ((laborRes.data ?? []) as LaborRole[]).map((r) => ({
    ...r,
    hourly_cost: Number(r.hourly_cost),
  }));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <Link
          href="/recipes"
          className={cn(buttonVariants({ variant: "ghost" }), "h-auto px-0 text-sm")}
        >
          ← Recetas
        </Link>
        <p className="text-muted-foreground mt-1 text-sm font-medium">{recipe.name}</p>
      </div>

      <RecipeForm
        key={recipe.id}
        ingredients={(ingRes.data ?? []) as Ingredient[]}
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
            quantity: Number(it.quantity),
            ingredient_yield_percentage:
              it.ingredient_yield_percentage != null
                ? Number(it.ingredient_yield_percentage)
                : 100,
          })),
          labor: laborRows.map((r) => ({
            labor_role_id: r.labor_role_id,
            minutes: Number(r.minutes),
            notes: r.notes ?? "",
          })),
        }}
      />
    </div>
  );
}
