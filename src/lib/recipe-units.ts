import type { IngredientUnit } from "./types";
import { sameFamily } from "./units";

/** Unidad práctica por defecto al añadir línea (g/ml en vez de kg/l). */
export function defaultRecipeQuantityUnit(catalogUnit: IngredientUnit): IngredientUnit {
  if (catalogUnit === "kg") return "g";
  if (catalogUnit === "l") return "ml";
  return catalogUnit;
}

export function unitsCompatibleWithIngredient(
  quantityUnit: IngredientUnit,
  catalogUnit: IngredientUnit,
): boolean {
  return sameFamily(quantityUnit, catalogUnit);
}
