import { describe, expect, it } from "vitest";
import {
  laborCostFromResolvedLines,
  recipeCostBreakdown,
  recipeCostSummary,
} from "./costs";
import type { IngredientUnit } from "./types";

const lubinaKg = "lubina" as const;
const pastaKg = "pasta" as const;
const aceiteL = "aceite" as const;

function units(...pairs: [string, IngredientUnit][]) {
  return new Map(pairs);
}

function prices(...pairs: [string, number][]) {
  return new Map(pairs);
}

describe("recipeCostBreakdown quantity_unit", () => {
  it("300 g de ingrediente kg a 32 €/kg = 9.60 €", () => {
    const bd = recipeCostBreakdown(
      [
        {
          ingredient_id: lubinaKg,
          quantity: 300,
          quantity_unit: "g",
          ingredient_yield_percentage: 100,
        },
      ],
      units([lubinaKg, "kg"]),
      prices([lubinaKg, 32]),
    );
    expect(bd.total_naive).toBeCloseTo(9.6, 2);
    expect(bd.total).toBeCloseTo(9.6, 2);
  });

  it("yield 85 % aumenta coste a ~11.29 €", () => {
    const bd = recipeCostBreakdown(
      [
        {
          ingredient_id: lubinaKg,
          quantity: 300,
          quantity_unit: "g",
          ingredient_yield_percentage: 85,
        },
      ],
      units([lubinaKg, "kg"]),
      prices([lubinaKg, 32]),
    );
    expect(bd.total).toBeCloseTo(11.294, 2);
  });

  it("120 g pasta kg a 2 €/kg = 0.24 €", () => {
    const bd = recipeCostBreakdown(
      [
        {
          ingredient_id: pastaKg,
          quantity: 120,
          quantity_unit: "g",
          ingredient_yield_percentage: 100,
        },
      ],
      units([pastaKg, "kg"]),
      prices([pastaKg, 2]),
    );
    expect(bd.total).toBeCloseTo(0.24, 2);
  });

  it("20 ml aceite l a 6 €/l = 0.12 €", () => {
    const bd = recipeCostBreakdown(
      [
        {
          ingredient_id: aceiteL,
          quantity: 20,
          quantity_unit: "ml",
          ingredient_yield_percentage: 100,
        },
      ],
      units([aceiteL, "l"]),
      prices([aceiteL, 6]),
    );
    expect(bd.total).toBeCloseTo(0.12, 2);
  });

  it("unidad incompatible → total null", () => {
    const bd = recipeCostBreakdown(
      [
        {
          ingredient_id: lubinaKg,
          quantity: 1,
          quantity_unit: "ud",
          ingredient_yield_percentage: 100,
        },
      ],
      units([lubinaKg, "kg"]),
      prices([lubinaKg, 32]),
    );
    expect(bd.total).toBeNull();
    expect(bd.missing_ingredient_ids).toContain(lubinaKg);
  });
});

describe("laborCostFromResolvedLines", () => {
  it("12 min × 18 €/h = 3.60 €", () => {
    expect(
      laborCostFromResolvedLines([{ minutes: 12, hourly_cost: 18 }]),
    ).toBeCloseTo(3.6, 2);
  });
});

describe("recipeCostSummary escandallo lubina", () => {
  it("coste fabricación ~14.89 €, margen ~9.11 €, % ~62 %", () => {
    const s = recipeCostSummary(
      [
        {
          ingredient_id: lubinaKg,
          quantity: 300,
          quantity_unit: "g",
          ingredient_yield_percentage: 85,
        },
      ],
      units([lubinaKg, "kg"]),
      prices([lubinaKg, 32]),
      [{ minutes: 12, hourly_cost: 18 }],
      1,
      24,
    );
    expect(s.ingredient_cost_naive).toBeCloseTo(9.6, 2);
    expect(s.ingredient_cost).toBeCloseTo(11.294, 2);
    expect(s.labor_cost).toBeCloseTo(3.6, 2);
    expect(s.total_cost).toBeCloseTo(14.894, 2);
    expect(s.cost_per_serving).toBeCloseTo(14.894, 2);
    expect(s.gross_margin).toBeCloseTo(9.106, 2);
    expect(s.food_cost_percentage).toBeCloseTo(62.06, 1);
  });
});
