"use client";

import { useFieldArray, useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { createPurchase } from "./actions";
import type { ExtractedPurchaseItem } from "@/lib/ocr-extraction";
import type { Supplier } from "@/types/supplier";
import type { Ingredient } from "@/types/ingredient";
import {
  INGREDIENT_UNITS,
  PURCHASE_DOCUMENT_TYPES,
  type IngredientUnit,
  type PurchaseDocumentType,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoneyEUR, unitLabel } from "@/lib/format";
import { Plus, Trash2, Camera, FileUp, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const DOCUMENT_LABELS: Record<PurchaseDocumentType, string> = {
  invoice: "Factura",
  delivery_note: "Albarán",
  receipt: "Ticket / recibo",
  order: "Pedido",
};

const lineSchema = z.object({
  raw_name: z.string().trim().min(1, "Nombre en el documento"),
  ingredient_id: z.string().optional(),
  quantity: z.coerce.number().positive(),
  quantity_unit: z.enum(INGREDIENT_UNITS),
  unit_price: z.coerce.number().nonnegative(),
  total_price: z.coerce.number().nonnegative(),
  needs_review: z.boolean().optional(),
});

const schema = z.object({
  supplier_id: z.string().uuid("Elige proveedor"),
  document_type: z.enum(PURCHASE_DOCUMENT_TYPES),
  document_number: z.string().optional(),
  purchase_date: z.string().min(1, "Fecha obligatoria"),
  notes: z.string().optional(),
  status: z.enum(["confirmed", "pending_review"]),
  lines: z.array(lineSchema).min(1, "Añade al menos una línea"),
});

type FormValues = z.infer<typeof schema>;

const STEPS = ["Documento", "Adjunto", "Líneas", "Revisión"] as const;

function unitPricePreview(q: number, total: number): string {
  if (!q || q <= 0) return "—";
  return formatMoneyEUR(total / q);
}

function defaultLine(): FormValues["lines"][number] {
  return {
    raw_name: "",
    ingredient_id: "",
    quantity: 1,
    quantity_unit: "kg",
    unit_price: 0,
    total_price: 0,
    needs_review: false,
  };
}

function mapOcrItemToLine(item: ExtractedPurchaseItem, ingredients: Ingredient[]): FormValues["lines"][number] {
  const sug = item.suggested_ingredient_name?.trim();
  let ingredient_id = "";
  if (sug) {
    const m = ingredients.find((i) => i.name.trim().toLowerCase() === sug.toLowerCase());
    if (m) ingredient_id = m.id;
  }
  return {
    raw_name: item.raw_name,
    ingredient_id,
    quantity: item.quantity,
    quantity_unit: item.quantity_unit,
    unit_price: item.unit_price,
    total_price: item.total_price,
    needs_review: item.needs_review,
  };
}

export function PurchaseForm({
  suppliers,
  ingredients,
}: {
  suppliers: Supplier[];
  ingredients: Ingredient[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [ocrLineHint, setOcrLineHint] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: {
      supplier_id: suppliers[0]?.id ?? "",
      document_type: "delivery_note",
      document_number: "",
      purchase_date: new Date().toISOString().slice(0, 10),
      notes: "",
      status: "confirmed",
      lines: [defaultLine()],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "lines",
  });

  const lineValues = useWatch({ control: form.control, name: "lines" }) ?? [];
  const supplierId = useWatch({ control: form.control, name: "supplier_id" });
  const purchaseDate = useWatch({ control: form.control, name: "purchase_date" });
  const documentType = useWatch({ control: form.control, name: "document_type" });
  const documentNumber = useWatch({ control: form.control, name: "document_number" });
  const notes = useWatch({ control: form.control, name: "notes" });

  const disabled = !suppliers.length;

  const onDrop = useCallback((accepted: File[]) => {
    const f = accepted[0];
    if (f) setInvoiceFile(f);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".webp", ".heic"],
      "application/pdf": [".pdf"],
    },
    noClick: false,
    multiple: false,
  });

  const onSubmit = useCallback(
    (values: FormValues) => {
      startTransition(async () => {
        const fd = new FormData();
        fd.set("supplier_id", values.supplier_id);
        fd.set("purchase_date", values.purchase_date);
        fd.set("document_type", values.document_type);
        fd.set("document_number", values.document_number?.trim() ?? "");
        fd.set("notes", values.notes?.trim() ?? "");
        fd.set("status", values.status);
        const linesPayload = values.lines.map((l) => ({
          raw_name: l.raw_name.trim(),
          ingredient_id: l.ingredient_id?.trim() ? l.ingredient_id : null,
          quantity: l.quantity,
          quantity_unit: l.quantity_unit,
          unit_price: l.unit_price,
          total_price: l.total_price,
        }));
        fd.set("lines", JSON.stringify(linesPayload));
        if (invoiceFile && invoiceFile.size > 0) fd.append("invoice", invoiceFile);

        const res = await createPurchase({}, fd);
        if (res.error) {
          toast.error(res.error);
          return;
        }
        toast.success("Compra registrada");
        const id = res.purchaseId;
        if (id) router.push(`/purchases/${id}`);
        else router.push("/purchases");
        router.refresh();
      });
    },
    [invoiceFile, router]
  );

  function nextFromStep0() {
    void form.trigger(["supplier_id", "purchase_date", "document_type"]).then((ok) => {
      if (ok) setStep(1);
    });
  }

  function nextFromStep2() {
    void form.trigger("lines").then((ok) => {
      if (ok) setStep(3);
    });
  }

  const supplierName = suppliers.find((s) => s.id === supplierId)?.name ?? "—";
  const linesSum = lineValues.reduce((s, ln) => s + (Number(ln?.total_price) || 0), 0);

  if (disabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nueva compra</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Crea al menos un proveedor para registrar compras.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nueva compra</CardTitle>
        <div className="text-muted-foreground mt-2 flex flex-wrap gap-2 text-xs">
          {STEPS.map((label, i) => (
            <span
              key={label}
              className={cn(
                "rounded-full border px-2 py-0.5",
                i === step && "border-primary bg-primary/10 text-foreground font-medium",
                i < step && "border-muted-foreground/30 text-muted-foreground"
              )}
            >
              {i + 1}. {label}
            </span>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
          {step === 0 ? (
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="supplier_id">Proveedor</Label>
                  <select
                    id="supplier_id"
                    className="border-input bg-background ring-offset-background focus-visible:ring-ring flex min-h-12 w-full rounded-lg border px-3 text-base outline-none focus-visible:ring-2"
                    {...form.register("supplier_id")}
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  {form.formState.errors.supplier_id ? (
                    <p className="text-destructive text-xs">{form.formState.errors.supplier_id.message}</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="document_type">Tipo de documento</Label>
                  <select
                    id="document_type"
                    className="border-input bg-background flex min-h-12 w-full rounded-lg border px-3 text-base outline-none focus-visible:ring-2"
                    {...form.register("document_type")}
                  >
                    {PURCHASE_DOCUMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {DOCUMENT_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="document_number">Número (albarán, factura…)</Label>
                  <Input
                    id="document_number"
                    className="min-h-12 text-base"
                    placeholder="Opcional"
                    {...form.register("document_number")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="purchase_date">Fecha del documento</Label>
                  <Input
                    id="purchase_date"
                    type="date"
                    className="min-h-12 text-base"
                    {...form.register("purchase_date")}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notas (opcional)</Label>
                <Input id="notes" className="min-h-12 text-base" {...form.register("notes")} />
              </div>
              <Button type="button" className="min-h-12 w-full text-base" onClick={nextFromStep0}>
                Siguiente: adjunto
              </Button>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="flex flex-col gap-4">
              <p className="text-muted-foreground text-sm">
                Opcional. Foto del albarán o PDF. En móvil: cámara o galería.
              </p>

              <div
                {...getRootProps()}
                className={cn(
                  "hidden cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 transition-colors md:flex",
                  isDragActive && "border-primary bg-primary/5"
                )}
              >
                <input {...getInputProps()} />
                <Upload className="text-muted-foreground size-8" aria-hidden />
                <span className="text-center text-sm font-medium">
                  Arrastra imagen o PDF, o haz clic para elegir
                </span>
              </div>

              <div className="flex flex-col gap-3 md:hidden">
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="sr-only"
                  onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)}
                />
                <Button
                  type="button"
                  variant="default"
                  className="min-h-12 w-full gap-2 text-base"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="size-5" aria-hidden />
                  Fotografiar documento
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-12 w-full gap-2 text-base"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileUp className="size-5" aria-hidden />
                  Galería o PDF
                </Button>
              </div>

              {invoiceFile ? (
                <p className="text-sm font-medium">Seleccionado: {invoiceFile.name}</p>
              ) : (
                <p className="text-muted-foreground text-sm">Sin archivo.</p>
              )}

              <div className="rounded-md border border-dashed p-3">
                <p className="text-muted-foreground text-xs">
                  OCR local (Docker): PaddleOCR en tu máquina, sin API keys de terceros. Rellena el paso «Líneas»;
                  la compra no se guarda hasta que pulses «Guardar compra».
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-2 min-h-11 w-full sm:w-auto"
                  disabled={pending || !invoiceFile || invoiceFile.type === "application/pdf"}
                  onClick={() => {
                    void form.trigger(["supplier_id", "purchase_date", "document_type"]).then((ok) => {
                      if (!ok) return;
                      if (!invoiceFile || invoiceFile.size === 0) {
                        toast.error("Selecciona una imagen primero");
                        return;
                      }
                      if (invoiceFile.type === "application/pdf") {
                        toast.error("El OCR local solo acepta imágenes, no PDF");
                        return;
                      }
                      startTransition(async () => {
                        const fd = new FormData();
                        fd.set("document_type", documentType);
                        fd.append("file", invoiceFile);
                        const res = await fetch("/api/purchases/ocr", {
                          method: "POST",
                          body: fd,
                          credentials: "include",
                        });
                        let json: { error?: string; items?: ExtractedPurchaseItem[] } = {};
                        try {
                          json = (await res.json()) as typeof json;
                        } catch {
                          /* ignore */
                        }
                        if (!res.ok) {
                          toast.error(json.error ?? "Error al extraer OCR");
                          return;
                        }
                        const items = json.items ?? [];
                        const nextLines =
                          items.length > 0
                            ? items.map((it) => mapOcrItemToLine(it, ingredients))
                            : [defaultLine()];
                        replace(nextLines);
                        form.setValue("status", "pending_review");
                        if (items.length === 0) {
                          const msg =
                            "No se detectaron líneas de producto. Añade las líneas a mano o prueba otra foto.";
                          setOcrLineHint(msg);
                          toast.message("Sin líneas detectadas", { description: msg });
                        } else {
                          const msg = `Hemos detectado ${items.length} línea${items.length === 1 ? "" : "s"}. Revísalas antes de guardar.`;
                          setOcrLineHint(msg);
                          toast.success(msg);
                        }
                        setStep(2);
                        router.refresh();
                      });
                    });
                  }}
                >
                  {pending ? "Extrayendo…" : "Extraer con OCR local"}
                </Button>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" className="min-h-12 flex-1" onClick={() => setStep(0)}>
                  Atrás
                </Button>
                <Button
                  type="button"
                  className="min-h-12 flex-1 text-base"
                  onClick={() => {
                    setOcrLineHint(null);
                    setStep(2);
                  }}
                >
                  Siguiente: líneas
                </Button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              {ocrLineHint ? (
                <p className="text-muted-foreground rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm">
                  {ocrLineHint}
                </p>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <Label>Líneas del documento</Label>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 gap-1"
                  onClick={() => append(defaultLine())}
                >
                  <Plus className="size-4" />
                  Añadir línea
                </Button>
              </div>

              <div className="flex flex-col gap-4">
                {fields.map((field, index) => {
                  const qty = Number(lineValues[index]?.quantity) || 0;
                  const total = Number(lineValues[index]?.total_price) || 0;
                  const qu = (lineValues[index]?.quantity_unit ?? "kg") as IngredientUnit;
                  return (
                    <div
                      key={field.id}
                      className="bg-muted/40 grid gap-3 rounded-lg border p-3 sm:grid-cols-12 sm:items-end"
                    >
                      <div className="sm:col-span-12 flex flex-wrap items-center gap-2">
                        <Label className="text-xs">Nombre en el documento</Label>
                        {lineValues[index]?.needs_review ? (
                          <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-900 dark:text-amber-100">
                            Revisar OCR
                          </span>
                        ) : null}
                      </div>
                      <div className="sm:col-span-12">
                        <Input
                          className="mt-1 min-h-12 text-base"
                          placeholder="Ej. Lubina"
                          {...form.register(`lines.${index}.raw_name`)}
                        />
                      </div>
                      <div className="sm:col-span-6">
                        <Label className="text-xs">Mapear a ingrediente (opcional)</Label>
                        <select
                          className="border-input bg-background mt-1 flex min-h-12 w-full rounded-lg border px-2 text-base"
                          {...form.register(`lines.${index}.ingredient_id`)}
                        >
                          <option value="">— Sin mapear —</option>
                          {ingredients.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name} ({unitLabel(i.unit)})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-3">
                        <Label className="text-xs">Unidad en documento</Label>
                        <select
                          className="border-input bg-background mt-1 flex min-h-12 w-full rounded-lg border px-2 text-base"
                          {...form.register(`lines.${index}.quantity_unit`)}
                        >
                          {INGREDIENT_UNITS.map((u) => (
                            <option key={u} value={u}>
                              {unitLabel(u)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-3">
                        <Label className="text-xs">Cantidad</Label>
                        <Input
                          type="number"
                          step="any"
                          min={0}
                          className="mt-1 min-h-12 text-base"
                          {...form.register(`lines.${index}.quantity`)}
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <Label className="text-xs">Precio / {unitLabel(qu)}</Label>
                        <Input
                          type="number"
                          step="any"
                          min={0}
                          className="mt-1 min-h-12 text-base"
                          {...form.register(`lines.${index}.unit_price`)}
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <Label className="text-xs">Total línea (€)</Label>
                        <Input
                          type="number"
                          step="any"
                          min={0}
                          className="mt-1 min-h-12 text-base"
                          {...form.register(`lines.${index}.total_price`)}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-muted-foreground text-xs">Comprobación</p>
                        <p className="mt-2 font-medium tabular-nums text-sm">
                          {unitPricePreview(qty, total)} / {unitLabel(qu)}
                        </p>
                      </div>
                      <div className="flex sm:col-span-1 sm:justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive min-h-12 min-w-12"
                          aria-label="Quitar línea"
                          disabled={fields.length <= 1}
                          onClick={() => remove(index)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      {form.formState.errors.lines?.[index]?.raw_name ? (
                        <p className="text-destructive text-xs sm:col-span-12">
                          {form.formState.errors.lines[index]?.raw_name?.message}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {form.formState.errors.lines?.root?.message ? (
                <p className="text-destructive text-xs">{form.formState.errors.lines.root.message}</p>
              ) : null}
              {typeof form.formState.errors.lines?.message === "string" ? (
                <p className="text-destructive text-xs">{form.formState.errors.lines.message}</p>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-12 flex-1"
                  onClick={() => {
                    setOcrLineHint(null);
                    setStep(1);
                  }}
                >
                  Atrás
                </Button>
                <Button type="button" className="min-h-12 flex-1 text-base" onClick={nextFromStep2}>
                  Siguiente: revisión
                </Button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="flex flex-col gap-4 text-sm">
              <div className="rounded-lg border bg-muted/20 p-4 space-y-1">
                <p>
                  <span className="text-muted-foreground">Proveedor:</span>{" "}
                  <span className="font-medium">{supplierName}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Documento:</span>{" "}
                  <span className="font-medium">{DOCUMENT_LABELS[documentType]}</span>
                  {documentNumber?.trim() ? (
                    <span className="font-medium"> · n.º {documentNumber.trim()}</span>
                  ) : null}
                </p>
                <p>
                  <span className="text-muted-foreground">Fecha:</span>{" "}
                  <span className="font-medium">{purchaseDate}</span>
                </p>
                {notes ? (
                  <p>
                    <span className="text-muted-foreground">Notas:</span> {notes}
                  </p>
                ) : null}
                <p>
                  <span className="text-muted-foreground">Adjunto:</span>{" "}
                  {invoiceFile ? invoiceFile.name : "Sin archivo"}
                </p>
                <p className="tabular-nums pt-1 border-t mt-2">
                  <span className="text-muted-foreground">Suma líneas:</span>{" "}
                  <span className="font-medium">{formatMoneyEUR(linesSum)}</span>
                </p>
              </div>

              <fieldset className="space-y-2 rounded-lg border p-4">
                <legend className="text-foreground px-1 text-sm font-medium">Estado al guardar</legend>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="radio" className="size-4" value="confirmed" {...form.register("status")} />
                  <span>Confirmada (afecta a costes de recetas si hay mapeo)</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="radio" className="size-4" value="pending_review" {...form.register("status")} />
                  <span>Pendiente de revisión (no alimenta último precio)</span>
                </label>
              </fieldset>

              <ul className="space-y-2 rounded-lg border p-4">
                {lineValues.map((ln, idx) => {
                  const ing = ln?.ingredient_id?.trim()
                    ? ingredients.find((i) => i.id === ln.ingredient_id)
                    : undefined;
                  const q = Number(ln?.quantity) || 0;
                  const t = Number(ln?.total_price) || 0;
                  const qu = (ln?.quantity_unit ?? "kg") as IngredientUnit;
                  return (
                    <li key={fields[idx]?.id ?? idx} className="flex flex-col border-b pb-2 last:border-0">
                      <span className="font-medium">{ln?.raw_name?.trim() || "—"}</span>
                      {ing ? (
                        <span className="text-muted-foreground text-xs">→ {ing.name}</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">Sin mapeo a ingrediente</span>
                      )}
                      <span className="text-muted-foreground">
                        {q} {unitLabel(qu)} · Total {formatMoneyEUR(t)} · {unitPricePreview(q, t)} / {unitLabel(qu)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" className="min-h-12 flex-1" onClick={() => setStep(2)}>
                  Atrás
                </Button>
                <Button type="submit" className="min-h-12 flex-1 text-base" disabled={pending}>
                  {pending ? "Guardando…" : "Guardar compra"}
                </Button>
              </div>
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
