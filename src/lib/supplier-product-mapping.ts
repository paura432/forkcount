import { normalizeSupplierProductName } from "./product-normalization";

export { normalizeSupplierProductName };

export type SupplierProductMappingLookup = {
  supplier_id: string | null;
  normalized_raw_name: string;
  ingredient_id: string;
  conversion_factor?: number;
};

export type SupplierProductMappingRow = SupplierProductMappingLookup & {
  id?: string;
  restaurant_id?: string;
  raw_product_name?: string;
};

/**
 * Elige mapeo: primero proveedor concreto, luego genérico (supplier_id null).
 */
export function selectSupplierProductMapping(
  mappings: SupplierProductMappingLookup[],
  supplierId: string | null,
  normalizedName: string,
): SupplierProductMappingLookup | null {
  if (!normalizedName) return null;
  const matches = mappings.filter((m) => m.normalized_raw_name === normalizedName);
  if (supplierId) {
    const specific = matches.find((m) => m.supplier_id === supplierId);
    if (specific) return specific;
  }
  return matches.find((m) => m.supplier_id === null) ?? null;
}

export type PurchaseLineForMapping = {
  raw_name: string;
  ingredient_id: string | null;
};

/**
 * Rellena ingredient_id desde mapeos cuando la línea no trae ingrediente.
 */
export function resolveIngredientIdsFromMappings<T extends PurchaseLineForMapping>(
  lines: T[],
  mappings: SupplierProductMappingLookup[],
  supplierId: string | null,
): T[] {
  if (mappings.length === 0) return lines;
  return lines.map((line) => {
    if (line.ingredient_id) return line;
    const raw = line.raw_name?.trim();
    if (!raw) return line;
    const normalized = normalizeSupplierProductName(raw);
    const hit = selectSupplierProductMapping(mappings, supplierId, normalized);
    if (!hit) return line;
    return { ...line, ingredient_id: hit.ingredient_id };
  });
}

export type UpsertSupplierProductMappingInput = {
  restaurant_id: string;
  supplier_id: string | null;
  raw_product_name: string;
  ingredient_id: string;
  conversion_factor?: number;
};

export type UpsertSupplierProductMappingPayload = UpsertSupplierProductMappingInput & {
  normalized_raw_name: string;
};

/**
 * Payload para insert/update. Si ya existe fila equivalente, devuelve existingId para update.
 */
export function buildSupplierProductMappingUpsert(
  input: UpsertSupplierProductMappingInput,
  existingRows: Array<{ id: string; supplier_id: string | null; normalized_raw_name: string }>,
): { payload: UpsertSupplierProductMappingPayload; existingId: string | null } {
  const raw = input.raw_product_name.trim();
  const normalized = normalizeSupplierProductName(raw);
  const payload: UpsertSupplierProductMappingPayload = {
    ...input,
    raw_product_name: raw,
    normalized_raw_name: normalized,
    conversion_factor: input.conversion_factor ?? 1,
  };

  const existing = existingRows.find(
    (r) =>
      r.normalized_raw_name === normalized &&
      (r.supplier_id ?? null) === (input.supplier_id ?? null),
  );

  return { payload, existingId: existing?.id ?? null };
}
