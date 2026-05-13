"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getRestaurantId } from "@/lib/auth/restaurant";

const laborRoleSchema = z.object({
  name: z.string().min(1, "Nombre obligatorio"),
  hourly_cost: z.coerce.number().min(0, "El coste horario no puede ser negativo"),
});

export type LaborRoleActionState = { error?: string; ok?: boolean };

export async function createLaborRole(
  _prev: LaborRoleActionState,
  formData: FormData
): Promise<LaborRoleActionState> {
  const parsed = laborRoleSchema.safeParse({
    name: formData.get("name"),
    hourly_cost: formData.get("hourly_cost"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const restaurant_id = await getRestaurantId();
  const supabase = await createClient();
  const { error } = await supabase.from("labor_roles").insert({
    restaurant_id,
    name: parsed.data.name.trim(),
    hourly_cost: parsed.data.hourly_cost,
  });
  if (error) return { error: error.message };
  revalidatePath("/labor-roles");
  revalidatePath("/recipes");
  return { ok: true };
}

export async function updateLaborRole(
  _prev: LaborRoleActionState,
  formData: FormData
): Promise<LaborRoleActionState> {
  const id = String(formData.get("id") || "");
  const parsed = laborRoleSchema.safeParse({
    name: formData.get("name"),
    hourly_cost: formData.get("hourly_cost"),
  });
  if (!id || !parsed.success) {
    return { error: "Datos inválidos" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("labor_roles")
    .update({
      name: parsed.data.name.trim(),
      hourly_cost: parsed.data.hourly_cost,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/labor-roles");
  revalidatePath("/recipes");
  return { ok: true };
}

export async function deleteLaborRole(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return { error: "Falta id" };
  const supabase = await createClient();
  const { error } = await supabase.from("labor_roles").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/labor-roles");
  revalidatePath("/recipes");
  return { ok: true };
}
