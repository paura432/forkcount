import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { PurchaseLinesReview, type PurchaseLineReview } from "../../purchase-lines-review";
import { lineNeedsOcrReview, ocrNeedsReviewByNormalizedName } from "@/lib/ocr-line-review";
import type { Ingredient } from "@/types/ingredient";

function firstRel<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default async function PurchaseMappingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: row, error }, ingRes] = await Promise.all([
    supabase
      .from("purchases")
      .select(
        `
        id,
        invoice_ocr_raw,
        suppliers (name),
        purchase_items (
          id,
          raw_name,
          quantity,
          quantity_unit,
          unit_price,
          total_price,
          ingredient_id,
          ingredients (name)
        )
      `,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("ingredients").select("*").order("name"),
  ]);

  if (error) return <p className="text-destructive text-sm">Error: {error.message}</p>;
  if (!row) notFound();

  const needsReviewByName = ocrNeedsReviewByNormalizedName(row.invoice_ocr_raw);
  const items = row.purchase_items ?? [];
  const lines: PurchaseLineReview[] = items.map((l) => {
    const ing = firstRel(
      l.ingredients as { name: string } | { name: string }[] | null,
    );
    return {
      id: l.id,
      raw_name: l.raw_name,
      quantity: Number(l.quantity),
      quantity_unit: l.quantity_unit,
      unit_price: Number(l.unit_price),
      total_price: Number(l.total_price),
      ingredient_id: l.ingredient_id,
      ingredient_name: ing?.name ?? null,
      needs_ocr_review: lineNeedsOcrReview(l.raw_name, needsReviewByName),
    };
  });

  const supplier = firstRel(row.suppliers as { name: string } | { name: string }[] | null);
  const pending = lines.filter((l) => !l.ingredient_id).length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link
          href={`/purchases/${id}`}
          className={buttonVariants({ variant: "ghost", className: "h-auto w-fit px-0 text-sm" })}
        >
          ← Volver a la compra
        </Link>
        <h1 className="mt-2 text-lg font-semibold">Asociar productos</h1>
        <p className="text-muted-foreground text-sm">
          {supplier?.name ?? "Proveedor"} · {pending} pendiente{pending === 1 ? "" : "s"}
        </p>
      </div>

      <PurchaseLinesReview
        lines={lines}
        ingredients={(ingRes.data ?? []) as Ingredient[]}
      />

      {pending === 0 ? (
        <p className="text-muted-foreground text-sm">Todos los productos están asociados.</p>
      ) : null}
    </div>
  );
}
