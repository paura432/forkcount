"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getRestaurantId } from "@/lib/auth/restaurant";

const itemSchema = z.object({
  ingredient_id: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  ingredient_yield_percentage: z.coerce.number().min(1).max(100),
});

const laborLineSchema = z.object({
  labor_role_id: z.string().uuid(),
  minutes: z.coerce.number().positive(),
  notes: z.string().optional(),
});

const recipeSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  servings: z.coerce.number().int().min(1, "Mínimo 1 ración"),
  selling_price: z.number().min(0).nullable().optional(),
  items: z.array(itemSchema).min(1, "Añade al menos un ingrediente"),
  labor: z.array(laborLineSchema).default([]),
});

export type RecipeActionState = { error?: string; ok?: boolean };

function parseSellingPrice(formData: FormData): number | null {
  const raw = formData.get("selling_price");
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export async function createRecipe(
  _prev: RecipeActionState,
  formData: FormData
): Promise<RecipeActionState> {
  const itemsRaw = formData.get("items");
  const laborRaw = formData.get("labor");
  let items: unknown;
  let labor: unknown;
  try {
    items = typeof itemsRaw === "string" ? JSON.parse(itemsRaw) : [];
  } catch {
    return { error: "Ingredientes inválidos" };
  }
  try {
    labor = typeof laborRaw === "string" ? JSON.parse(laborRaw) : [];
  } catch {
    return { error: "Manufactura inválida" };
  }

  const selling_price = parseSellingPrice(formData);

  const parsed = recipeSchema.safeParse({
    name: formData.get("name"),
    description: (formData.get("description") as string) || undefined,
    servings: formData.get("servings"),
    selling_price,
    items,
    labor,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const restaurant_id = await getRestaurantId();
  const supabase = await createClient();

  const { data: recipe, error: rErr } = await supabase
    .from("recipes")
    .insert({
      restaurant_id,
      name: parsed.data.name.trim(),
      description: parsed.data.description?.trim() || null,
      servings: parsed.data.servings,
      selling_price: parsed.data.selling_price ?? null,
    })
    .select("id")
    .single();

  if (rErr || !recipe) return { error: rErr?.message ?? "No se creó la receta" };

  const rows = parsed.data.items.map((it) => ({
    recipe_id: recipe.id,
    ingredient_id: it.ingredient_id,
    quantity: it.quantity,
    ingredient_yield_percentage: it.ingredient_yield_percentage,
  }));

  const { error: iErr } = await supabase.from("recipe_items").insert(rows);
  if (iErr) {
    await supabase.from("recipes").delete().eq("id", recipe.id);
    return { error: iErr.message };
  }

  if (parsed.data.labor.length > 0) {
    const laborRows = parsed.data.labor.map((l) => ({
      recipe_id: recipe.id,
      labor_role_id: l.labor_role_id,
      minutes: l.minutes,
      notes: l.notes?.trim() || null,
    }));
    const { error: lErr } = await supabase.from("recipe_labor_items").insert(laborRows);
    if (lErr) {
      await supabase.from("recipes").delete().eq("id", recipe.id);
      return { error: lErr.message };
    }
  }

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipe.id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateRecipe(
  _prev: RecipeActionState,
  formData: FormData
): Promise<RecipeActionState> {
  const id = String(formData.get("id") || "");
  const itemsRaw = formData.get("items");
  const laborRaw = formData.get("labor");
  let items: unknown;
  let labor: unknown;
  try {
    items = typeof itemsRaw === "string" ? JSON.parse(itemsRaw) : [];
  } catch {
    return { error: "Ingredientes inválidos" };
  }
  try {
    labor = typeof laborRaw === "string" ? JSON.parse(laborRaw) : [];
  } catch {
    return { error: "Manufactura inválida" };
  }

  const selling_price = parseSellingPrice(formData);

  const parsed = recipeSchema.safeParse({
    name: formData.get("name"),
    description: (formData.get("description") as string) || undefined,
    servings: formData.get("servings"),
    selling_price,
    items,
    labor,
  });
  if (!id || !parsed.success) return { error: "Datos inválidos" };

  const supabase = await createClient();

  const { error: uErr } = await supabase
    .from("recipes")
    .update({
      name: parsed.data.name.trim(),
      description: parsed.data.description?.trim() || null,
      servings: parsed.data.servings,
      selling_price: parsed.data.selling_price ?? null,
    })
    .eq("id", id);

  if (uErr) return { error: uErr.message };

  await supabase.from("recipe_items").delete().eq("recipe_id", id);
  await supabase.from("recipe_labor_items").delete().eq("recipe_id", id);

  const rows = parsed.data.items.map((it) => ({
    recipe_id: id,
    ingredient_id: it.ingredient_id,
    quantity: it.quantity,
    ingredient_yield_percentage: it.ingredient_yield_percentage,
  }));

  const { error: iErr } = await supabase.from("recipe_items").insert(rows);
  if (iErr) return { error: iErr.message };

  if (parsed.data.labor.length > 0) {
    const laborRows = parsed.data.labor.map((l) => ({
      recipe_id: id,
      labor_role_id: l.labor_role_id,
      minutes: l.minutes,
      notes: l.notes?.trim() || null,
    }));
    const { error: lErr } = await supabase.from("recipe_labor_items").insert(laborRows);
    if (lErr) return { error: lErr.message };
  }

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteRecipe(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return { error: "Falta id" };
  const supabase = await createClient();
  const { error } = await supabase.from("recipes").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/recipes");
  revalidatePath(`/recipes/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
