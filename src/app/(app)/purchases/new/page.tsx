import { createClient } from "@/lib/supabase/server";
import { PurchaseForm } from "../purchase-form";
import type { Supplier } from "@/types/supplier";
import type { Ingredient } from "@/types/ingredient";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default async function NewPurchasePage() {
  const supabase = await createClient();

  const [supRes, ingRes] = await Promise.all([
    supabase.from("suppliers").select("*").order("name"),
    supabase.from("ingredients").select("*").order("name"),
  ]);

  if (supRes.error || ingRes.error) {
    const msg = supRes.error?.message ?? ingRes.error?.message;
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
      />
    </div>
  );
}
