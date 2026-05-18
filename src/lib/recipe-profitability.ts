import type { RecipeCostSummary } from "./types";

export type RecipeProfitabilityStatus =
  | "no_prices"
  | "no_pvp"
  | "profitable"
  | "tight_margin"
  | "neutral";

export function recipeProfitabilityStatus(
  summary: Pick<
    RecipeCostSummary,
    "missing_ingredient_ids" | "selling_price" | "food_cost_percentage" | "total_cost"
  >,
): RecipeProfitabilityStatus {
  if (summary.missing_ingredient_ids.length > 0 || summary.total_cost == null) {
    return "no_prices";
  }
  if (summary.selling_price == null || summary.selling_price <= 0) {
    return "no_pvp";
  }
  const pct = summary.food_cost_percentage;
  if (pct == null) return "no_prices";
  if (pct <= 30) return "profitable";
  if (pct > 40) return "tight_margin";
  return "neutral";
}

export const PROFITABILITY_LABEL: Record<RecipeProfitabilityStatus, string> = {
  no_prices: "Faltan precios",
  no_pvp: "Sin PVP",
  profitable: "Rentable",
  tight_margin: "Margen ajustado",
  neutral: "Margen medio",
};
