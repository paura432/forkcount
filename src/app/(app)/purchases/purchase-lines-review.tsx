"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoneyEUR, unitLabel } from "@/lib/format";
import { PurchaseItemAssociateDialog } from "./purchase-item-associate-dialog";
import type { Ingredient } from "@/types/ingredient";

export type PurchaseLineReview = {
  id: string;
  raw_name: string;
  quantity: number;
  quantity_unit: string;
  unit_price: number;
  total_price: number;
  ingredient_id: string | null;
  ingredient_name: string | null;
  needs_ocr_review?: boolean;
};

export function PurchaseLinesReview({
  lines,
  ingredients,
  title = "Productos pendientes de asociar",
}: {
  lines: PurchaseLineReview[];
  ingredients: Ingredient[];
  title?: string;
}) {
  const pending = lines.filter((l) => !l.ingredient_id);
  if (pending.length === 0) return null;

  return (
    <Card id="mapping" className="border-amber-500/40 bg-amber-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-muted-foreground text-sm">
          {pending.length} producto{pending.length === 1 ? "" : "s"} sin ingrediente interno.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {pending.map((line) => (
          <div
            key={line.id}
            className="flex flex-col gap-3 rounded-lg border bg-background p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{line.raw_name}</p>
                {line.needs_ocr_review ? (
                  <Badge variant="outline" className="text-xs font-normal">
                    Revisar OCR
                  </Badge>
                ) : null}
              </div>
              <p className="text-muted-foreground text-sm tabular-nums">
                {Number(line.quantity)} {unitLabel(line.quantity_unit)} ·{" "}
                {formatMoneyEUR(Number(line.unit_price))} / un. ·{" "}
                {formatMoneyEUR(Number(line.total_price))}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-amber-500/50 text-amber-950 dark:text-amber-100">
                Pendiente
              </Badge>
              <PurchaseItemAssociateDialog
                purchaseItemId={line.id}
                rawName={line.raw_name}
                quantity={line.quantity}
                quantityUnit={line.quantity_unit}
                unitPrice={line.unit_price}
                totalPrice={line.total_price}
                ingredients={ingredients}
              />
              <PurchaseItemAssociateDialog
                purchaseItemId={line.id}
                rawName={line.raw_name}
                quantity={line.quantity}
                quantityUnit={line.quantity_unit}
                unitPrice={line.unit_price}
                totalPrice={line.total_price}
                ingredients={ingredients}
                triggerLabel="Crear ingrediente"
                defaultMode="new"
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
