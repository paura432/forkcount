import type { IngredientUnit } from "./types";

export function quantityUnitOptionsForCatalog(
  catalogUnit: IngredientUnit,
): IngredientUnit[] {
  if (catalogUnit === "g" || catalogUnit === "kg") return ["g", "kg"];
  if (catalogUnit === "ml" || catalogUnit === "l") return ["ml", "l"];
  return ["ud"];
}
