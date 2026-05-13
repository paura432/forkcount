import { createClient } from "@/lib/supabase/server";
import { LaborRolesClient } from "./labor-roles-client";
import type { LaborRole } from "@/types/recipe";

export default async function LaborRolesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("labor_roles")
    .select("*")
    .order("name");

  if (error) {
    return (
      <p className="text-destructive text-sm">
        Error cargando roles: {error.message}
      </p>
    );
  }

  const rows = (data ?? []) as LaborRole[];
  const normalized: LaborRole[] = rows.map((r) => ({
    ...r,
    hourly_cost: Number(r.hourly_cost),
  }));

  return <LaborRolesClient initial={normalized} />;
}
