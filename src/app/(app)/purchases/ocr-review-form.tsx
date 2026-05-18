"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { confirmOcrPurchase } from "./actions";
import type { Ingredient } from "@/types/ingredient";
import { INGREDIENT_UNITS, type IngredientUnit } from "@/lib/types";
import {
  buildInvoiceOcrDraftFromReview,
  type InvoiceOcrDraft,
} from "@/lib/ocr-extraction";
import { formatMoneyEUR, unitLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { OcrWarningsBanner } from "@/components/purchases/ocr-warnings-banner";

function parseOptionalMoneyInput(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const MSG_LINES_NOT_PARSED =
  "Hemos podido leer texto de la imagen, pero no hemos identificado líneas de compra automáticamente. Puedes revisar el texto detectado o introducir las líneas manualmente.";

type LineRow = {
  raw_name: string;
  ingredient_id: string;
  quantity: number;
  quantity_unit: IngredientUnit;
  unit_price: number;
  total_price: number;
  needs_review: boolean;
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
        needs_review: false,
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
    needs_review: it.needs_review,
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

  const doc = draft.ocr.document;
  const [documentSupplierName, setDocumentSupplierName] = useState(
    () => doc?.supplier_name?.trim() ?? "",
  );
  const [documentSupplierTaxId, setDocumentSupplierTaxId] = useState(
    () => doc?.supplier_tax_id?.trim() ?? "",
  );
  const [documentCustomerName, setDocumentCustomerName] = useState(
    () => doc?.customer_name?.trim() ?? "",
  );
  const [documentCustomerTaxId, setDocumentCustomerTaxId] = useState(
    () => doc?.customer_tax_id?.trim() ?? "",
  );
  const [documentNumber, setDocumentNumber] = useState(() => doc?.document_number?.trim() ?? "");
  const [purchaseDate, setPurchaseDate] = useState(() => doc?.document_date?.trim() ?? "");
  const [subtotal, setSubtotal] = useState<string>(() =>
    doc?.subtotal != null ? String(doc.subtotal) : "",
  );
  const [taxAmount, setTaxAmount] = useState<string>(() => (doc?.tax != null ? String(doc.tax) : ""));
  const [totalAmount, setTotalAmount] = useState<string>(() =>
    doc?.total != null ? String(doc.total) : "",
  );

  const warnings = useMemo(() => {
    const raw = draft.ocr.debug?.warnings;
    if (!Array.isArray(raw)) return [] as string[];
    return [...new Set(raw.filter((w): w is string => typeof w === "string" && w.trim().length > 0))];
  }, [draft.ocr.debug?.warnings]);

  const recon = draft.ocr.reconstructed_lines ?? draft.ocr.lines ?? [];
  const showNoLinesButText = draft.items.length === 0 && recon.some((l) => String(l).trim().length > 0);

  const updateLine = useCallback((index: number, patch: Partial<LineRow>) => {
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
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
        needs_review: false,
      },
    ]);
  }, []);

  const removeLine = useCallback((index: number) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }, []);

  const submit = useCallback(() => {
    startTransition(async () => {
      const st = parseOptionalMoneyInput(subtotal);
      const tax = parseOptionalMoneyInput(taxAmount);
      const tot = parseOptionalMoneyInput(totalAmount);
      if (
        (subtotal.trim() !== "" && st === null) ||
        (taxAmount.trim() !== "" && tax === null) ||
        (totalAmount.trim() !== "" && tot === null)
      ) {
        toast.error("Revisa subtotal, IVA y total (números válidos ≥ 0)");
        return;
      }

      const updatedDraft = buildInvoiceOcrDraftFromReview(draft.document_type, null, {
        document_supplier_name: documentSupplierName,
        document_supplier_tax_id: documentSupplierTaxId,
        document_customer_name: documentCustomerName,
        document_customer_tax_id: documentCustomerTaxId,
        document_number: documentNumber,
        purchase_date: purchaseDate,
        subtotal: st,
        tax_amount: tax,
        total_amount: tot,
        lines,
      });
      updatedDraft.ocr.text = draft.ocr.text;
      updatedDraft.ocr.lines = draft.ocr.lines;
      updatedDraft.ocr.raw_text = draft.ocr.raw_text;
      updatedDraft.ocr.reconstructed_lines = draft.ocr.reconstructed_lines;
      updatedDraft.ocr.blocks = draft.ocr.blocks;
      updatedDraft.ocr.debug = draft.ocr.debug;

      const res = await confirmOcrPurchase({
        purchaseId,
        status,
        document_number: documentNumber,
        purchase_date: purchaseDate,
        subtotal: st,
        tax_amount: tax,
        total_amount: tot,
        invoice_ocr_raw: updatedDraft,
        lines: lines.map((l) => ({
          raw_name: l.raw_name.trim(),
          ingredient_id: l.ingredient_id?.trim() ? l.ingredient_id.trim() : null,
          quantity: l.quantity,
          quantity_unit: l.quantity_unit,
          unit_price: l.unit_price,
          total_price: l.total_price,
        })),
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Compra guardada");
      router.refresh();
    });
  }, [
    documentCustomerName,
    documentCustomerTaxId,
    documentNumber,
    documentSupplierName,
    documentSupplierTaxId,
    draft,
    lines,
    purchaseDate,
    purchaseId,
    router,
    status,
    subtotal,
    taxAmount,
    totalAmount,
  ]);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
      <div>
        <h2 className="text-lg font-semibold">Revisar datos del documento</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Corrige cabecera, importes y líneas. La compra no se completa hasta pulsar Guardar compra.
        </p>
      </div>

      <OcrWarningsBanner warnings={warnings} />

      {showNoLinesButText ? (
        <p className="rounded-md border border-amber-500/30 bg-background px-3 py-2 text-sm">
          {MSG_LINES_NOT_PARSED}
        </p>
      ) : null}

      <div className="bg-background space-y-4 rounded-md border p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Proveedor</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="ocr_supplier_name">Nombre o razón social</Label>
            <Input
              id="ocr_supplier_name"
              className="min-h-11"
              value={documentSupplierName}
              onChange={(e) => setDocumentSupplierName(e.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="ocr_supplier_tax">CIF / NIF</Label>
            <Input
              id="ocr_supplier_tax"
              className="min-h-11"
              value={documentSupplierTaxId}
              onChange={(e) => setDocumentSupplierTaxId(e.target.value)}
            />
          </div>
        </div>

        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">Cliente</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="ocr_customer_name">Nombre o razón social</Label>
            <Input
              id="ocr_customer_name"
              className="min-h-11"
              value={documentCustomerName}
              onChange={(e) => setDocumentCustomerName(e.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="ocr_customer_tax">CIF / NIF cliente</Label>
            <Input
              id="ocr_customer_tax"
              className="min-h-11"
              value={documentCustomerTaxId}
              onChange={(e) => setDocumentCustomerTaxId(e.target.value)}
            />
          </div>
        </div>

        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">Documento</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="ocr_doc_number">Número de documento</Label>
            <Input
              id="ocr_doc_number"
              className="min-h-11"
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ocr_doc_date">Fecha</Label>
            <Input
              id="ocr_doc_date"
              type="date"
              className="min-h-11"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
          </div>
        </div>

        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">Importes</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="ocr_subtotal">Subtotal (€)</Label>
            <Input
              id="ocr_subtotal"
              className="min-h-11 tabular-nums"
              value={subtotal}
              onChange={(e) => setSubtotal(e.target.value)}
              type="number"
              step="any"
              min={0}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ocr_tax">IVA (€)</Label>
            <Input
              id="ocr_tax"
              className="min-h-11 tabular-nums"
              value={taxAmount}
              onChange={(e) => setTaxAmount(e.target.value)}
              type="number"
              step="any"
              min={0}
            />
          </div>
          <div className="space-y-1 sm:col-span-3 sm:max-w-md">
            <Label htmlFor="ocr_total">Total (€)</Label>
            <Input
              id="ocr_total"
              className="min-h-11 tabular-nums"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              type="number"
              step="any"
              min={0}
            />
          </div>
        </div>
      </div>

      {recon.length > 0 ? (
        <details className="rounded-md border bg-background text-sm">
          <summary className="cursor-pointer px-3 py-2 font-medium">Texto detectado (línea a línea)</summary>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap border-t px-3 py-2 text-xs text-muted-foreground">
            {recon.join("\n")}
          </pre>
        </details>
      ) : null}

      <div className="space-y-3">
        <Label className="text-base">Líneas de compra</Label>
        <p className="text-muted-foreground text-xs">Producto, cantidad, unidad, precio unitario e importe</p>

        <div className="hidden rounded-lg border md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="w-24 text-right">Cantidad</TableHead>
                <TableHead className="w-28">Unidad</TableHead>
                <TableHead className="w-32 text-right">P. unitario</TableHead>
                <TableHead className="w-32 text-right">Importe</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((ln, index) => (
                <TableRow key={index}>
                  <TableCell className="align-top">
                    <div className="flex flex-col gap-1">
                      {ln.needs_review ? (
                        <span className="w-fit rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-950 dark:text-amber-100">
                          Revisar
                        </span>
                      ) : null}
                      <Input
                        className="min-h-10"
                        value={ln.raw_name}
                        onChange={(e) => updateLine(index, { raw_name: e.target.value })}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <Input
                      type="number"
                      step="any"
                      min={0}
                      className="min-h-10 text-right tabular-nums"
                      value={ln.quantity}
                      onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <select
                      className="border-input bg-background flex min-h-10 w-full rounded-md border px-2 text-sm"
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
                  </TableCell>
                  <TableCell className="align-top">
                    <Input
                      type="number"
                      step="any"
                      min={0}
                      className="min-h-10 text-right tabular-nums"
                      value={ln.unit_price}
                      onChange={(e) => updateLine(index, { unit_price: Number(e.target.value) })}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <Input
                      type="number"
                      step="any"
                      min={0}
                      className="min-h-10 text-right tabular-nums"
                      value={ln.total_price}
                      onChange={(e) => updateLine(index, { total_price: Number(e.target.value) })}
                    />
                  </TableCell>
                  <TableCell className="align-top">
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col gap-3 md:hidden">
          {lines.map((ln, index) => (
            <div
              key={index}
              className="bg-background grid gap-2 rounded-md border p-3 sm:grid-cols-12 sm:items-end"
            >
              <div className="sm:col-span-12 flex flex-wrap items-start gap-2">
                <Label className="text-xs">Producto</Label>
                {ln.needs_review ? (
                  <span className="w-fit rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-950 dark:text-amber-100">
                    Revisar
                  </span>
                ) : null}
              </div>
              <div className="sm:col-span-12">
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
                <Label className="text-xs">Importe</Label>
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
        <Button type="button" className="min-h-12" disabled={pending} onClick={submit}>
          {pending ? "Guardando…" : "Guardar compra"}
        </Button>
        <span className="text-muted-foreground text-sm tabular-nums">
          Suma líneas: {formatMoneyEUR(lines.reduce((s, l) => s + (Number(l.total_price) || 0), 0))}
        </span>
      </div>
    </div>
  );
}
