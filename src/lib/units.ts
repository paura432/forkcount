import type { IngredientUnit } from "./types";
import { INGREDIENT_UNITS } from "./types";

export type UnitFamily = "mass" | "volume" | "count";

export function unitFamily(unit: IngredientUnit): UnitFamily {
  if (unit === "g" || unit === "kg") return "mass";
  if (unit === "ml" || unit === "l") return "volume";
  return "count";
}

export function sameFamily(a: IngredientUnit, b: IngredientUnit): boolean {
  return unitFamily(a) === unitFamily(b);
}

/** Gramos o mililitros según familia; `ud` → misma magnitud (1 ud = 1 base). */
export function toBaseAmount(amount: number, unit: IngredientUnit): number {
  switch (unit) {
    case "kg":
      return amount * 1000;
    case "g":
      return amount;
    case "l":
      return amount * 1000;
    case "ml":
      return amount;
    case "ud":
      return amount;
    default: {
      const _exhaustive: never = unit;
      return _exhaustive;
    }
  }
}

export function fromBaseAmount(base: number, unit: IngredientUnit): number {
  switch (unit) {
    case "kg":
      return base / 1000;
    case "g":
      return base;
    case "l":
      return base / 1000;
    case "ml":
      return base;
    case "ud":
      return base;
    default: {
      const _exhaustive: never = unit;
      return _exhaustive;
    }
  }
}

/**
 * Convierte cantidad entre unidades compatibles (misma familia).
 * Masa/volumen: vía g o ml internos. `ud` solo a `ud`.
 */
export function convertQuantity(
  amount: number,
  from: IngredientUnit,
  to: IngredientUnit,
): number {
  if (!sameFamily(from, to)) {
    throw new Error(`Cannot convert ${from} to ${to}: different unit families`);
  }
  const base = toBaseAmount(amount, from);
  return fromBaseAmount(base, to);
}

export function isIngredientUnit(value: string): value is IngredientUnit {
  return (INGREDIENT_UNITS as readonly string[]).includes(value);
}
