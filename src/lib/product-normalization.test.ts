import { describe, expect, it } from "vitest";
import {
  defaultIngredientNameFromRaw,
  normalizeSupplierProductName,
} from "./product-normalization";

describe("normalizeSupplierProductName", () => {
  it("normaliza casos básicos", () => {
    expect(normalizeSupplierProductName("LUBINA")).toBe("lubina");
    expect(normalizeSupplierProductName("  Lubina  ")).toBe("lubina");
    expect(normalizeSupplierProductName("MERO")).toBe("mero");
  });

  it("quita tildes y símbolos", () => {
    expect(normalizeSupplierProductName("Jamón Serrano")).toBe("jamon serrano");
    expect(normalizeSupplierProductName("Yema Huevo Liquida,BTLL 1ltr-Ovim")).toBe(
      "yema huevo liquida btll 1ltr ovim",
    );
  });
});

describe("defaultIngredientNameFromRaw", () => {
  it("capitaliza palabras", () => {
    expect(defaultIngredientNameFromRaw("LUBINA")).toBe("Lubina");
    expect(defaultIngredientNameFromRaw("mero fresco")).toBe("Mero Fresco");
  });
});
