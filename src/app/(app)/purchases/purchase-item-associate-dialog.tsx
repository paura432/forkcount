"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { associatePurchaseItem } from "./mapping-actions";
import type { Ingredient } from "@/types/ingredient";
import { INGREDIENT_UNITS, type IngredientUnit } from "@/lib/types";
import { formatMoneyEUR, unitLabel } from "@/lib/format";
import { defaultIngredientNameFromRaw } from "@/lib/product-normalization";
import { isIngredientUnit } from "@/lib/units";

type Mode = "existing" | "new";

function defaultUnitFromQuantityUnit(quantityUnit: string): IngredientUnit {
  return isIngredientUnit(quantityUnit) ? quantityUnit : "kg";
}

export function PurchaseItemAssociateDialog({
  purchaseItemId,
  rawName,
  quantity,
  quantityUnit,
  unitPrice,
  totalPrice,
  ingredients,
  triggerLabel = "Asociar",
  defaultMode = "existing",
}: {
  purchaseItemId: string;
  rawName: string;
  quantity: number;
  quantityUnit: string;
  unitPrice: number;
  totalPrice: number;
  ingredients: Ingredient[];
  triggerLabel?: string;
  defaultMode?: Mode;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [ingredientId, setIngredientId] = useState("");
  const [newName, setNewName] = useState(() => defaultIngredientNameFromRaw(rawName));
  const [newUnit, setNewUnit] = useState<IngredientUnit>(() =>
    defaultUnitFromQuantityUnit(quantityUnit),
  );
  const [saveMapping, setSaveMapping] = useState(true);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setNewName(defaultIngredientNameFromRaw(rawName));
      setNewUnit(defaultUnitFromQuantityUnit(quantityUnit));
      setIngredientId("");
      setMode(defaultMode);
      setSaveMapping(true);
    }
  }

  function submit() {
    startTransition(async () => {
      const res = await associatePurchaseItem({
        purchaseItemId,
        ingredientId: mode === "existing" ? ingredientId || undefined : undefined,
        newIngredientName: mode === "new" ? newName : undefined,
        newIngredientUnit: mode === "new" ? newUnit : undefined,
        saveMapping,
        conversionFactor: 1,
      });
      if (res.error) {
        toast.error(res.error);
        if (res.ok) setOpen(false);
        return;
      }
      toast.success("Ingrediente asociado");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="min-h-9" />}>
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Asociar producto</DialogTitle>
          <DialogDescription>
            <span className="block">
              Documento: <span className="text-foreground font-medium">{rawName}</span>
            </span>
            <span className="text-muted-foreground mt-1 block tabular-nums">
              {quantity} {unitLabel(quantityUnit)} · {formatMoneyEUR(unitPrice)} / un. ·{" "}
              {formatMoneyEUR(totalPrice)} total
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === "existing" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("existing")}
            >
              Existente
            </Button>
            <Button
              type="button"
              variant={mode === "new" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("new")}
            >
              Crear ingrediente
            </Button>
          </div>

          {mode === "existing" ? (
            <div className="space-y-2">
              <Label htmlFor="assoc-ingredient">Ingrediente del catálogo</Label>
              <select
                id="assoc-ingredient"
                className="border-input bg-background flex min-h-11 w-full rounded-lg border px-3 text-sm"
                value={ingredientId}
                onChange={(e) => setIngredientId(e.target.value)}
              >
                <option value="">— Elige —</option>
                {ingredients.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({unitLabel(i.unit)})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="space-y-2">
                <Label htmlFor="assoc-new-name">Nombre ingrediente</Label>
                <Input
                  id="assoc-new-name"
                  className="min-h-11"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assoc-new-unit">Unidad de coste</Label>
                <select
                  id="assoc-new-unit"
                  className="border-input bg-background flex min-h-11 w-full rounded-lg border px-3 text-sm"
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value as IngredientUnit)}
                >
                  {INGREDIENT_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {unitLabel(u)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border"
              checked={saveMapping}
              onChange={(e) => setSaveMapping(e.target.checked)}
            />
            Recordar para próximas compras de este proveedor
          </label>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={
              pending ||
              (mode === "existing" && !ingredientId) ||
              (mode === "new" && !newName.trim())
            }
            onClick={submit}
          >
            {pending ? "Guardando…" : "Asociar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
