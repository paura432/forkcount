import type {
  IngredientUnit,
  LatestUnitPriceRow,
  RecipeCostBreakdown,
  RecipeCostLine,
  RecipeCostSummary,
  RecipeLaborLineResolved,
  RecipeLineForCost,
  WeightedLot,
} from "./types";
import { convertQuantity, sameFamily } from "./units";

const EPS = 1e-9;

/** unit_price coherente con total y cantidad. `toleranceAbs` en € (p. ej. 0.02 para OCR). */
export function purchaseLineCoherent(
  quantity: number,
  unitPrice: number,
  totalPrice: number,
  opts?: { toleranceAbs?: number },
): boolean {
  if (quantity <= 0 || unitPrice < 0 || totalPrice < 0) return false;
  const tol = opts?.toleranceAbs ?? EPS;
  return Math.abs(quantity * unitPrice - totalPrice) <= tol;
}

export function impliedUnitPrice(
  totalPrice: number,
  quantity: number,
): number {
  if (quantity <= 0) throw new Error("quantity must be positive");
  return totalPrice / quantity;
}

/**
 * Mapa ingredient_id → precio unitario (misma unidad que el ingrediente en catálogo).
 * `rows` típico: salida de `latest_unit_prices`.
 */
export function priceMapFromLatestRows(
  rows: LatestUnitPriceRow[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    m.set(r.ingredient_id, r.unit_price);
  }
  return m;
}

function yieldFactor(yieldPct: number): number | null {
  if (!Number.isFinite(yieldPct) || yieldPct <= 0 || yieldPct > 100) return null;
  return 100 / yieldPct;
}

/**
 * Coste de receta: suma cantidad (en unidad de catálogo) × precio unitario × (100/yield).
 * Falta precio, ingrediente desconocido, familia incompatible o yield inválido → `total` null.
 */
export function recipeCostBreakdown(
  lines: RecipeLineForCost[],
  ingredientUnitById: Map<string, IngredientUnit>,
  unitPriceByIngredientId: Map<string, number>,
): RecipeCostBreakdown {
  const outLines: RecipeCostLine[] = [];
  const missing: string[] = [];

  for (const line of lines) {
    const yieldPct = line.ingredient_yield_percentage ?? 100;
    const yf = yieldFactor(yieldPct);
    const catalogUnit = ingredientUnitById.get(line.ingredient_id);
    const unitPrice = unitPriceByIngredientId.get(line.ingredient_id);

    if (catalogUnit === undefined || yf === null) {
      missing.push(line.ingredient_id);
      outLines.push({
        ingredient_id: line.ingredient_id,
        quantity: line.quantity,
        quantity_unit: line.quantity_unit,
        ingredient_unit: catalogUnit ?? line.quantity_unit,
        ingredient_yield_percentage: yieldPct,
        unit_price: unitPrice ?? null,
        line_cost_naive: null,
        line_cost: null,
      });
      continue;
    }

    if (!sameFamily(line.quantity_unit, catalogUnit)) {
      missing.push(line.ingredient_id);
      outLines.push({
        ingredient_id: line.ingredient_id,
        quantity: line.quantity,
        quantity_unit: line.quantity_unit,
        ingredient_unit: catalogUnit,
        ingredient_yield_percentage: yieldPct,
        unit_price: unitPrice ?? null,
        line_cost_naive: null,
        line_cost: null,
      });
      continue;
    }

    let qtyInCatalogUnit = line.quantity;
    if (line.quantity_unit !== catalogUnit) {
      try {
        qtyInCatalogUnit = convertQuantity(
          line.quantity,
          line.quantity_unit,
          catalogUnit,
        );
      } catch {
        missing.push(line.ingredient_id);
        outLines.push({
          ingredient_id: line.ingredient_id,
          quantity: line.quantity,
          quantity_unit: line.quantity_unit,
          ingredient_unit: catalogUnit,
          ingredient_yield_percentage: yieldPct,
          unit_price: unitPrice ?? null,
          line_cost_naive: null,
          line_cost: null,
        });
        continue;
      }
    }

    const up = unitPrice ?? null;
    const naive = up === null ? null : qtyInCatalogUnit * up;
    const lc = naive === null ? null : naive * yf;
    if (up === null) missing.push(line.ingredient_id);
    outLines.push({
      ingredient_id: line.ingredient_id,
      quantity: line.quantity,
      quantity_unit: line.quantity_unit,
      ingredient_unit: catalogUnit,
      ingredient_yield_percentage: yieldPct,
      unit_price: up,
      line_cost_naive: naive,
      line_cost: lc,
    });
  }

  const distinctMissing = [...new Set(missing)];
  const complete = distinctMissing.length === 0;
  const totalNaive = complete
    ? outLines.reduce((s, l) => s + (l.line_cost_naive ?? 0), 0)
    : null;
  const total = complete
    ? outLines.reduce((s, l) => s + (l.line_cost ?? 0), 0)
    : null;

  return {
    lines: outLines,
    total,
    total_naive: totalNaive,
    missing_ingredient_ids: distinctMissing,
  };
}

/**
 * Suma (minutos/60) × coste_horario. Array vacío → 0.
 * Minutos ≤ 0 o coste horario inválido → null.
 */
export function laborCostFromResolvedLines(
  lines: RecipeLaborLineResolved[],
): number | null {
  let sum = 0;
  for (const { minutes, hourly_cost } of lines) {
    if (!Number.isFinite(minutes) || !Number.isFinite(hourly_cost)) return null;
    if (minutes <= 0 || hourly_cost < 0) return null;
    sum += (minutes / 60) * hourly_cost;
  }
  return sum;
}

/**
 * Resumen económico unificado (ingredientes con merma, manufactura, PVP, márgenes).
 * `laborLines`: `[]` sin manufactura; `null` si hay líneas de mano de obra incompletas (rol o minutos inválidos).
 */
export function recipeCostSummary(
  lines: RecipeLineForCost[],
  ingredientUnitById: Map<string, IngredientUnit>,
  unitPriceByIngredientId: Map<string, number>,
  laborLines: RecipeLaborLineResolved[] | null,
  servings: number,
  selling_price: number | null,
): RecipeCostSummary {
  const bd = recipeCostBreakdown(
    lines,
    ingredientUnitById,
    unitPriceByIngredientId,
  );
  const labor =
    laborLines === null ? null : laborCostFromResolvedLines(laborLines);

  const ingredient_cost_naive = bd.total_naive;
  const ingredient_cost = bd.total;
  const waste_adjustment_cost =
    ingredient_cost != null && ingredient_cost_naive != null
      ? ingredient_cost - ingredient_cost_naive
      : null;

  const total_cost =
    bd.total != null && labor != null ? bd.total + labor : null;

  const servingsNum = Math.max(1, Math.floor(servings) || 1);
  const cost_per_serving =
    total_cost != null ? total_cost / servingsNum : null;

  const gross_margin =
    selling_price != null && cost_per_serving != null
      ? selling_price - cost_per_serving
      : null;

  const food_cost_percentage =
    selling_price != null &&
    selling_price > 0 &&
    cost_per_serving != null
      ? (cost_per_serving / selling_price) * 100
      : null;

  return {
    ingredient_cost_naive,
    ingredient_cost,
    waste_adjustment_cost,
    labor_cost: labor,
    total_cost,
    servings: servingsNum,
    cost_per_serving,
    selling_price,
    gross_margin,
    food_cost_percentage,
    missing_ingredient_ids: bd.missing_ingredient_ids,
  };
}

/** Coste medio ponderado por lote (misma unidad implícita por ingrediente). */
export function weightedAverageUnitPrice(lots: WeightedLot[]): number | null {
  if (lots.length === 0) return null;
  let sumQty = 0;
  let sumVal = 0;
  for (const { quantity, unit_price } of lots) {
    if (quantity <= 0 || unit_price < 0) return null;
    sumQty += quantity;
    sumVal += quantity * unit_price;
  }
  if (sumQty <= 0) return null;
  return sumVal / sumQty;
}
