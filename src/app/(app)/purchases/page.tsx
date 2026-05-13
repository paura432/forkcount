import { createClient } from "@/lib/supabase/server";
import { PurchasesTable } from "./purchases-table";

export default async function PurchasesPage() {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("purchases")
    .select(
      "id, purchase_date, document_type, document_number, status, total_amount, invoice_path, invoice_original_name, notes, suppliers(name)"
    )
    .order("purchase_date", { ascending: false });

  if (error) {
    return <p className="text-destructive text-sm">Error: {error.message}</p>;
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <PurchasesTable rows={(rows ?? []) as never} />
    </div>
  );
}
