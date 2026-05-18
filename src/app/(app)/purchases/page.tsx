import { createClient } from "@/lib/supabase/server";
import { pendingAssociationCountByPurchase } from "@/lib/purchase-pending-counts";
import { PurchasesTable } from "./purchases-table";

export default async function PurchasesPage() {
  const supabase = await createClient();

  const [{ data: rows, error }, pendingRes] = await Promise.all([
    supabase
      .from("purchases")
      .select(
        "id, purchase_date, document_type, document_number, status, total_amount, invoice_path, invoice_original_name, notes, suppliers(name)",
      )
      .order("purchase_date", { ascending: false }),
    supabase.from("purchase_items").select("purchase_id").is("ingredient_id", null),
  ]);

  if (error || pendingRes.error) {
    const msg = error?.message ?? pendingRes.error?.message;
    return <p className="text-destructive text-sm">Error: {msg}</p>;
  }

  const pendingByPurchase = pendingAssociationCountByPurchase(pendingRes.data ?? []);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <PurchasesTable
        rows={(rows ?? []) as never}
        pendingByPurchase={Object.fromEntries(pendingByPurchase)}
      />
    </div>
  );
}
