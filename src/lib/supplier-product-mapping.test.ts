import { describe, expect, it } from "vitest";
import {
  buildSupplierProductMappingUpsert,
  resolveIngredientIdsFromMappings,
  selectSupplierProductMapping,
  type SupplierProductMappingLookup,
} from "./supplier-product-mapping";

describe("selectSupplierProductMapping", () => {
  const mappings: SupplierProductMappingLookup[] = [
    {
      supplier_id: "sup-a",
      normalized_raw_name: "lubina",
      ingredient_id: "ing-a",
    },
    {
      supplier_id: null,
      normalized_raw_name: "sal fina",
      ingredient_id: "ing-generic",
    },
  ];

  it("prefers supplier-specific over generic", () => {
    const all: SupplierProductMappingLookup[] = [
      ...mappings,
      {
        supplier_id: null,
        normalized_raw_name: "lubina",
        ingredient_id: "ing-generic-lubina",
      },
    ];
    const hit = selectSupplierProductMapping(all, "sup-a", "lubina");
    expect(hit?.ingredient_id).toBe("ing-a");
  });

  it("falls back to generic mapping", () => {
    const hit = selectSupplierProductMapping(mappings, "sup-other", "sal fina");
    expect(hit?.ingredient_id).toBe("ing-generic");
  });

  it("returns null when no match", () => {
    expect(selectSupplierProductMapping(mappings, "sup-a", "tomate")).toBeNull();
  });
});

describe("resolveIngredientIdsFromMappings", () => {
  const mappings: SupplierProductMappingLookup[] = [
    {
      supplier_id: "sup-1",
      normalized_raw_name: "lubina",
      ingredient_id: "ing-lubina",
    },
  ];

  it("fills missing ingredient_id only", () => {
    const out = resolveIngredientIdsFromMappings(
      [
        { raw_name: "LUBINA", ingredient_id: null },
        { raw_name: "LUBINA", ingredient_id: "already-set" },
      ],
      mappings,
      "sup-1",
    );
    expect(out[0].ingredient_id).toBe("ing-lubina");
    expect(out[1].ingredient_id).toBe("already-set");
  });

  it("leaves line null when no mapping", () => {
    const lines = [{ raw_name: "TOMATE", ingredient_id: null }];
    expect(resolveIngredientIdsFromMappings(lines, mappings, "sup-1")).toEqual(lines);
  });

  it("applies generic mapping without supplier", () => {
    const generic: SupplierProductMappingLookup[] = [
      { supplier_id: null, normalized_raw_name: "mero", ingredient_id: "ing-mero" },
    ];
    const out = resolveIngredientIdsFromMappings(
      [{ raw_name: "MERO", ingredient_id: null }],
      generic,
      "any-supplier",
    );
    expect(out[0].ingredient_id).toBe("ing-mero");
  });
});

describe("buildSupplierProductMappingUpsert", () => {
  it("detects existing row to avoid duplicate insert", () => {
    const { existingId, payload } = buildSupplierProductMappingUpsert(
      {
        restaurant_id: "r1",
        supplier_id: "sup-easo",
        raw_product_name: "LUBINA",
        ingredient_id: "ing-lubina",
      },
      [
        {
          id: "map-1",
          supplier_id: "sup-easo",
          normalized_raw_name: "lubina",
        },
      ],
    );
    expect(existingId).toBe("map-1");
    expect(payload.normalized_raw_name).toBe("lubina");
  });

  it("returns null existingId for new mapping", () => {
    const { existingId, payload } = buildSupplierProductMappingUpsert(
      {
        restaurant_id: "r1",
        supplier_id: "sup-easo",
        raw_product_name: "MERO",
        ingredient_id: "ing-mero",
      },
      [
        {
          id: "map-1",
          supplier_id: "sup-easo",
          normalized_raw_name: "lubina",
        },
      ],
    );
    expect(existingId).toBeNull();
    expect(payload.normalized_raw_name).toBe("mero");
  });
});
