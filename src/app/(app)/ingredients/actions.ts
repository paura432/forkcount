"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getRestaurantId } from "@/lib/auth/restaurant";
import { INGREDIENT_UNITS } from "@/types/ingredient-unit";

const ingredientSchema = z.object({
  name: z.string().min(1, "Nombre obligatorio"),
  unit: z.enum(INGREDIENT_UNITS),
});

export type IngredientActionState = { error?: string; ok?: boolean };

export async function createIngredient(
  _prev: IngredientActionState,
  formData: FormData
): Promise<IngredientActionState> {
  const parsed = ingredientSchema.safeParse({
    name: formData.get("name"),
    unit: formData.get("unit"),
  });
  if (!parsed.success) {
    return { error: "Datos inválidos" };
  }
  const restaurant_id = await getRestaurantId();
  const supabase = await createClient();
  const { error } = await supabase.from("ingredients").insert({
    restaurant_id,
    name: parsed.data.name.trim(),
    unit: parsed.data.unit,
  });
  if (error) return { error: error.message };
  revalidatePath("/ingredients");
  revalidatePath("/purchases");
  revalidatePath("/recipes");
  return { ok: true };
}

export async function updateIngredient(
  _prev: IngredientActionState,
  formData: FormData
): Promise<IngredientActionState> {
  const id = String(formData.get("id") || "");
  const parsed = ingredientSchema.safeParse({
    name: formData.get("name"),
    unit: formData.get("unit"),
  });
  if (!id || !parsed.success) return { error: "Datos inválidos" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("ingredients")
    .update({
      name: parsed.data.name.trim(),
      unit: parsed.data.unit,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/ingredients");
  revalidatePath("/purchases");
  revalidatePath("/recipes");
  return { ok: true };
}

export async function deleteIngredient(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return { error: "Falta id" };
  const supabase = await createClient();
  const { error } = await supabase.from("ingredients").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/ingredients");
  return { ok: true };
}
