import { createClient } from "@/lib/supabase/server";
import { IngredientsClient } from "./ingredients-client";
import type { Ingredient } from "@/types/ingredient";

export default async function IngredientsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ingredients")
    .select("*")
    .order("name");

  if (error) {
    return (
      <p className="text-destructive text-sm">
        Error cargando ingredientes: {error.message}
      </p>
    );
  }

  return <IngredientsClient initial={(data ?? []) as Ingredient[]} />;
}
