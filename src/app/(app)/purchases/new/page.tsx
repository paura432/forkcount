import { createClient } from "@/lib/supabase/server";
import { PurchaseForm } from "../purchase-form";
import type { Supplier } from "@/types/supplier";
import type { Ingredient } from "@/types/ingredient";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default async function NewPurchasePage() {
  const supabase = await createClient();

  const [supRes, ingRes, mapRes] = await Promise.all([
    supabase.from("suppliers").select("*").order("name"),
    supabase.from("ingredients").select("*").order("name"),
    supabase
      .from("supplier_product_mappings")
      .select("supplier_id, normalized_raw_name, ingredient_id"),
  ]);

  if (supRes.error || ingRes.error || mapRes.error) {
    const msg = supRes.error?.message ?? ingRes.error?.message ?? mapRes.error?.message;
    return <p className="text-destructive text-sm">Error: {msg}</p>;
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <Link
          href="/purchases"
          className={buttonVariants({ variant: "ghost", className: "h-auto w-fit px-0 text-sm" })}
        >
          ← Volver a compras
        </Link>
      </div>
      <PurchaseForm
        suppliers={(supRes.data ?? []) as Supplier[]}
        ingredients={(ingRes.data ?? []) as Ingredient[]}
        productMappings={mapRes.data ?? []}
      />
    </div>
  );
}
