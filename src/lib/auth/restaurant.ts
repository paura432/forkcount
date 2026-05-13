import { createClient } from "@/lib/supabase/server";

export async function getRestaurantId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data, error } = await supabase
    .from("profiles")
    .select("restaurant_id")
    .eq("id", user.id)
    .single();

  if (error || !data?.restaurant_id) {
    throw new Error("Perfil sin restaurante");
  }
  return data.restaurant_id;
}
