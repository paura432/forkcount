"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getRestaurantId } from "@/lib/auth/restaurant";

const supplierSchema = z.object({
  name: z.string().min(1, "Nombre obligatorio"),
  phone: z.string().optional(),
  email: z
    .string()
    .optional()
    .transform((s) => (s == null ? "" : String(s).trim()))
    .refine((s) => s === "" || z.string().email().safeParse(s).success, {
      message: "Email inválido",
    }),
});

export type SupplierActionState = { error?: string; ok?: boolean };

export async function createSupplier(
  _prev: SupplierActionState,
  formData: FormData
): Promise<SupplierActionState> {
  const parsed = supplierSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.name?.[0] ?? "Datos inválidos" };
  }
  const restaurant_id = await getRestaurantId();
  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").insert({
    restaurant_id,
    name: parsed.data.name.trim(),
    phone: parsed.data.phone?.trim() || null,
    email: parsed.data.email === "" ? null : parsed.data.email,
  });
  if (error) return { error: error.message };
  revalidatePath("/suppliers");
  return { ok: true };
}

export async function updateSupplier(
  _prev: SupplierActionState,
  formData: FormData
): Promise<SupplierActionState> {
  const id = String(formData.get("id") || "");
  const parsed = supplierSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
  });
  if (!id || !parsed.success) {
    return { error: "Datos inválidos" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({
      name: parsed.data.name.trim(),
      phone: parsed.data.phone?.trim() || null,
      email: parsed.data.email === "" ? null : parsed.data.email,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/suppliers");
  return { ok: true };
}

export async function deleteSupplier(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return { error: "Falta id" };
  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/suppliers");
  return { ok: true };
}
