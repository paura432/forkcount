import { createClient } from "@/lib/supabase/server";
import { SuppliersClient } from "./suppliers-client";
import type { Supplier } from "@/types/supplier";

export default async function SuppliersPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .order("name");

  if (error) {
    return (
      <p className="text-destructive text-sm">
        Error cargando proveedores: {error.message}
      </p>
    );
  }

  return <SuppliersClient initial={(data ?? []) as Supplier[]} />;
}
