import { purchaseLineCoherent } from "./costs";
import type { IngredientUnit } from "./types";
import { toBaseAmount } from "./units";

/** Unidad base para coste: gramos, mililitros o unidades. */
export type NormalizedBaseUnit = "g" | "ml" | "ud";

export function normalizedBaseUnit(quantityUnit: IngredientUnit): NormalizedBaseUnit {
  if (quantityUnit === "g" || quantityUnit === "kg") return "g";
  if (quantityUnit === "ml" || quantityUnit === "l") return "ml";
  return "ud";
}

/**
 * Convierte cantidad y total de línea a base (g, ml o ud) y precio por unidad base.
 * Coherencia: `quantity * unit_price ≈ total_price` (ver `purchaseLineCoherent`).
 */
export function normalizePurchaseLine(
  input: {
    quantity: number;
    quantity_unit: IngredientUnit;
    unit_price: number;
    total_price: number;
  },
  opts?: { coherenceToleranceAbs?: number },
): {
  normalized_quantity: number;
  normalized_unit: NormalizedBaseUnit;
  normalized_unit_price: number;
} {
  const { quantity, quantity_unit, unit_price, total_price } = input;
  if (!purchaseLineCoherent(quantity, unit_price, total_price, { toleranceAbs: opts?.coherenceToleranceAbs })) {
    throw new Error("Línea incoherente: cantidad × precio unitario ≠ total");
  }
  const normalized_quantity = toBaseAmount(quantity, quantity_unit);
  if (normalized_quantity <= 0) {
    throw new Error("La cantidad normalizada debe ser positiva");
  }
  return {
    normalized_quantity,
    normalized_unit: normalizedBaseUnit(quantity_unit),
    normalized_unit_price: total_price / normalized_quantity,
  };
}
