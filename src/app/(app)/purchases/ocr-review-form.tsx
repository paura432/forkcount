"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import { confirmOcrPurchase } from "./actions";
import type { Ingredient } from "@/types/ingredient";
import { INGREDIENT_UNITS, type IngredientUnit } from "@/lib/types";
import type { InvoiceOcrDraft } from "@/lib/ocr-extraction";
import { formatMoneyEUR, unitLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";

type LineRow = {
  raw_name: string;
  ingredient_id: string;
  quantity: number;
  quantity_unit: IngredientUnit;
  unit_price: number;
  total_price: number;
};

function draftToLines(draft: InvoiceOcrDraft): LineRow[] {
  if (draft.items.length === 0) {
    return [
      {
        raw_name: "",
        ingredient_id: "",
        quantity: 1,
        quantity_unit: "kg",
        unit_price: 0,
        total_price: 0,
      },
    ];
  }
  return draft.items.map((it) => ({
    raw_name: it.raw_name,
    ingredient_id: "",
    quantity: it.quantity,
    quantity_unit: it.quantity_unit,
    unit_price: it.unit_price,
    total_price: it.total_price,
  }));
}

export function OcrReviewForm({
  purchaseId,
  draft,
  ingredients,
}: {
  purchaseId: string;
  draft: InvoiceOcrDraft;
  ingredients: Ingredient[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lines, setLines] = useState<LineRow[]>(() => draftToLines(draft));
  const [status, setStatus] = useState<"confirmed" | "pending_review">("pending_review");

  const updateLine = useCallback((index: number, patch: Partial<LineRow>) => {
    setLines((prev) => {
      const next = [...prev];
      const cur = { ...next[index], ...patch };
      next[index] = cur;
      return next;
    });
  }, []);

  const addLine = useCallback(() => {
    setLines((prev) => [
      ...prev,
      {
        raw_name: "",
        ingredient_id: "",
        quantity: 1,
        quantity_unit: "kg",
        unit_price: 0,
        total_price: 0,
      },
    ]);
  }, []);

  const removeLine = useCallback((index: number) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }, []);

  const submit = useCallback(() => {
    startTransition(async () => {
      const payload = {
        purchaseId,
        status,
        lines: lines.map((l) => ({
          raw_name: l.raw_name.trim(),
          ingredient_id: l.ingredient_id?.trim() ? l.ingredient_id.trim() : null,
          quantity: l.quantity,
          quantity_unit: l.quantity_unit,
          unit_price: l.unit_price,
          total_price: l.total_price,
        })),
      };
      const res = await confirmOcrPurchase(payload);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Líneas guardadas");
      router.refresh();
    });
  }, [lines, purchaseId, router, status]);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
      <div>
        <h2 className="text-lg font-semibold">Revisar extracción OCR</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Corrige cantidades y nombres antes de confirmar. El documento sigue en{" "}
          <span className="font-medium">pendiente de revisión</span> hasta que guardes.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {lines.map((ln, index) => (
          <div
            key={index}
            className="bg-background grid gap-2 rounded-md border p-3 sm:grid-cols-12 sm:items-end"
          >
            <div className="sm:col-span-12">
              <Label className="text-xs">Nombre en el documento</Label>
              <Input
                className="mt-1 min-h-11"
                value={ln.raw_name}
                onChange={(e) => updateLine(index, { raw_name: e.target.value })}
              />
            </div>
            <div className="sm:col-span-6">
              <Label className="text-xs">Ingrediente (opcional)</Label>
              <select
                className="border-input bg-background mt-1 flex min-h-11 w-full rounded-md border px-2 text-sm"
                value={ln.ingredient_id}
                onChange={(e) => updateLine(index, { ingredient_id: e.target.value })}
              >
                <option value="">— Sin mapear —</option>
                {ingredients.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({unitLabel(i.unit)})
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Unidad</Label>
              <select
                className="border-input bg-background mt-1 flex min-h-11 w-full rounded-md border px-2 text-sm"
                value={ln.quantity_unit}
                onChange={(e) =>
                  updateLine(index, { quantity_unit: e.target.value as IngredientUnit })
                }
              >
                {INGREDIENT_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {unitLabel(u)}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Cantidad</Label>
              <Input
                type="number"
                step="any"
                min={0}
                className="mt-1 min-h-11"
                value={ln.quantity}
                onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">P. unit.</Label>
              <Input
                type="number"
                step="any"
                min={0}
                className="mt-1 min-h-11"
                value={ln.unit_price}
                onChange={(e) => updateLine(index, { unit_price: Number(e.target.value) })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Total</Label>
              <Input
                type="number"
                step="any"
                min={0}
                className="mt-1 min-h-11"
                value={ln.total_price}
                onChange={(e) => updateLine(index, { total_price: Number(e.target.value) })}
              />
            </div>
            <div className="flex sm:col-span-2 sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-destructive"
                aria-label="Quitar línea"
                disabled={lines.length <= 1}
                onClick={() => removeLine(index)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" className="w-fit gap-1" onClick={addLine}>
        <Plus className="size-4" />
        Añadir línea
      </Button>

      <fieldset className="space-y-2 rounded-md border p-3">
        <legend className="text-sm font-medium">Estado al guardar</legend>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="radio"
            className="size-4"
            checked={status === "confirmed"}
            onChange={() => setStatus("confirmed")}
          />
          Confirmada (afecta últimos precios si hay mapeo)
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="radio"
            className="size-4"
            checked={status === "pending_review"}
            onChange={() => setStatus("pending_review")}
          />
          Seguir en pendiente de revisión
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={pending} onClick={submit}>
          {pending ? "Guardando…" : "Guardar líneas"}
        </Button>
        <span className="text-muted-foreground text-sm tabular-nums">
          Suma líneas:{" "}
          {formatMoneyEUR(lines.reduce((s, l) => s + (Number(l.total_price) || 0), 0))}
        </span>
      </div>
    </div>
  );
}
