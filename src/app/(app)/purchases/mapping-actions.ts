"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getRestaurantId } from "@/lib/auth/restaurant";
import { buildSupplierProductMappingUpsert } from "@/lib/supplier-product-mapping";
import { isIngredientUnit } from "@/lib/units";
import type { IngredientUnit } from "@/lib/types";

const associateSchema = z.object({
  purchaseItemId: z.string().uuid(),
  ingredientId: z.string().uuid().optional(),
  newIngredientName: z.string().trim().min(1).optional(),
  newIngredientUnit: z
    .string()
    .refine((u): u is IngredientUnit => isIngredientUnit(u), "Unidad inválida")
    .optional(),
  saveMapping: z.boolean().default(true),
  conversionFactor: z.coerce.number().positive().default(1),
});

export type AssociatePurchaseItemResult = {
  error?: string;
  ok?: boolean;
  ingredientId?: string;
};

export async function associatePurchaseItem(
  input: z.infer<typeof associateSchema>,
): Promise<AssociatePurchaseItemResult> {
  const parsed = associateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  if (!parsed.data.ingredientId && !parsed.data.newIngredientName) {
    return { error: "Elige un ingrediente o crea uno nuevo" };
  }
  if (parsed.data.newIngredientName && !parsed.data.newIngredientUnit) {
    return { error: "Unidad obligatoria para ingrediente nuevo" };
  }

  const restaurant_id = await getRestaurantId();
  const supabase = await createClient();

  const { data: item, error: itemErr } = await supabase
    .from("purchase_items")
    .select(
      `
      id,
      raw_name,
      ingredient_id,
      purchase_id,
      purchases!inner (
        id,
        restaurant_id,
        supplier_id
      )
    `,
    )
    .eq("id", parsed.data.purchaseItemId)
    .maybeSingle();

  if (itemErr || !item) {
    return { error: itemErr?.message ?? "Línea no encontrada" };
  }

  const purchase = Array.isArray(item.purchases) ? item.purchases[0] : item.purchases;
  if (!purchase || purchase.restaurant_id !== restaurant_id) {
    return { error: "No autorizado" };
  }

  let ingredientId = parsed.data.ingredientId ?? null;

  if (parsed.data.newIngredientName) {
    const unit = parsed.data.newIngredientUnit as IngredientUnit;
    const { data: created, error: createErr } = await supabase
      .from("ingredients")
      .insert({
        restaurant_id,
        name: parsed.data.newIngredientName.trim(),
        unit,
      })
      .select("id")
      .single();
    if (createErr || !created) {
      return { error: createErr?.message ?? "No se creó el ingrediente" };
    }
    ingredientId = created.id;
  }

  if (!ingredientId) return { error: "Ingrediente no válido" };

  const { error: updErr } = await supabase
    .from("purchase_items")
    .update({ ingredient_id: ingredientId })
    .eq("id", parsed.data.purchaseItemId);

  if (updErr) return { error: updErr.message };

  const rawName = item.raw_name?.trim();
  if (parsed.data.saveMapping && rawName) {
    const supplierId = purchase.supplier_id ?? null;

    const { data: existingRows, error: listErr } = await supabase
      .from("supplier_product_mappings")
      .select("id, supplier_id, normalized_raw_name")
      .eq("restaurant_id", restaurant_id);

    if (listErr) {
      return {
        error: `Línea asociada pero no se guardó el mapeo: ${listErr.message}`,
        ok: true,
        ingredientId,
      };
    }

    const { payload, existingId } = buildSupplierProductMappingUpsert(
      {
        restaurant_id,
        supplier_id: supplierId,
        raw_product_name: rawName,
        ingredient_id: ingredientId,
        conversion_factor: parsed.data.conversionFactor,
      },
      existingRows ?? [],
    );

    const mapSave = existingId
      ? await supabase
          .from("supplier_product_mappings")
          .update({
            raw_product_name: payload.raw_product_name,
            normalized_raw_name: payload.normalized_raw_name,
            ingredient_id: payload.ingredient_id,
            conversion_factor: payload.conversion_factor,
          })
          .eq("id", existingId)
      : await supabase.from("supplier_product_mappings").insert({
          restaurant_id: payload.restaurant_id,
          supplier_id: payload.supplier_id,
          raw_product_name: payload.raw_product_name,
          normalized_raw_name: payload.normalized_raw_name,
          ingredient_id: payload.ingredient_id,
          conversion_factor: payload.conversion_factor,
        });

    if (mapSave.error) {
      return {
        error: `Línea asociada pero no se guardó el mapeo: ${mapSave.error.message}`,
        ok: true,
        ingredientId,
      };
    }
  }

  revalidatePath(`/purchases/${purchase.id}`);
  revalidatePath(`/purchases/${purchase.id}/mapping`);
  revalidatePath("/purchases");
  revalidatePath("/recipes");
  revalidatePath("/dashboard");
  return { ok: true, ingredientId };
}
