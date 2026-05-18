import { recipeCostSummary } from "./costs";
import type {
  IngredientUnit,
  RecipeCostSummary,
  RecipeLaborLineResolved,
  RecipeLineForCost,
} from "./types";

export type RecipeItemCostInput = {
  ingredient_id: string;
  quantity: number;
  quantity_unit: IngredientUnit;
  ingredient_yield_percentage: number;
};

export type RecipeLaborCostInput = {
  labor_role_id: string;
  minutes: number;
};

export function buildRecipeCostSummary(input: {
  items: RecipeItemCostInput[];
  labor: RecipeLaborCostInput[];
  ingredientUnitById: Map<string, IngredientUnit>;
  unitPriceByIngredientId: Map<string, number>;
  laborHourlyByRoleId: Map<string, number>;
  servings: number;
  selling_price: number | null;
}): RecipeCostSummary {
  const lines: RecipeLineForCost[] = input.items.map((it) => ({
    ingredient_id: it.ingredient_id,
    quantity: it.quantity,
    quantity_unit: it.quantity_unit,
    ingredient_yield_percentage: it.ingredient_yield_percentage,
  }));

  let laborResolved: RecipeLaborLineResolved[] | null = [];
  if (input.labor.length > 0) {
    const rows: RecipeLaborLineResolved[] = [];
    for (const row of input.labor) {
      const hc = input.laborHourlyByRoleId.get(row.labor_role_id);
      if (hc == null || !Number.isFinite(hc) || hc < 0 || row.minutes <= 0) {
        laborResolved = null;
        break;
      }
      rows.push({ minutes: row.minutes, hourly_cost: hc });
    }
    if (laborResolved !== null) laborResolved = rows;
  }

  return recipeCostSummary(
    lines,
    input.ingredientUnitById,
    input.unitPriceByIngredientId,
    laborResolved,
    input.servings,
    input.selling_price,
  );
}
