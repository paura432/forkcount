import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeSupplierProductName,
  type SupplierProductMappingLookup,
} from "./supplier-product-mapping";

export async function fetchSupplierProductMappings(
  supabase: SupabaseClient,
  supplierId: string | null,
  rawNames: string[],
): Promise<SupplierProductMappingLookup[]> {
  const normalized = [
    ...new Set(
      rawNames
        .map((n) => normalizeSupplierProductName(n))
        .filter((n) => n.length > 0),
    ),
  ];
  if (normalized.length === 0) return [];

  let query = supabase
    .from("supplier_product_mappings")
    .select("supplier_id, normalized_raw_name, ingredient_id, conversion_factor")
    .in("normalized_raw_name", normalized);

  if (supplierId) {
    query = query.or(`supplier_id.eq.${supplierId},supplier_id.is.null`);
  } else {
    query = query.is("supplier_id", null);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierProductMappingLookup[];
}
