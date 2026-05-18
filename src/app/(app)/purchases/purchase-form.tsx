"use client";

import {
  useFieldArray,
  useForm,
  useWatch,
  type Resolver,
  type UseFormSetValue,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { createPurchase } from "./actions";
import {
  buildInvoiceOcrDraftFromReview,
  type ExtractedPurchaseItem,
  type NormalizedOcrExtraction,
  parseOcrHttpResponse,
} from "@/lib/ocr-extraction";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoneyEUR, unitLabel } from "@/lib/format";
import { Plus, Trash2, Camera, ImagePlus, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { OcrWarningsBanner } from "@/components/purchases/ocr-warnings-banner";
import {
  normalizeSupplierProductName,
  selectSupplierProductMapping,
  type SupplierProductMappingLookup,
} from "@/lib/supplier-product-mapping";

const DOCUMENT_LABELS: Record<PurchaseDocumentType, string> = {
  invoice: "Factura",
  delivery_note: "Albarán",
  receipt: "Ticket / recibo",
  order: "Pedido",
};

const MSG_BAD_IMAGE =
  "No hemos podido leer bien la imagen. Prueba con una foto más frontal, con mejor luz y sin sombras.";

const MSG_LINES_NOT_PARSED =
  "Hemos podido leer texto de la imagen, pero no hemos identificado líneas de compra automáticamente. Puedes revisar el texto detectado o introducir las líneas manualmente.";

const optionalMoney = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().nonnegative().optional(),
);

function appendDocumentPartiesToNotes(
  base: string,
  parties: {
    document_supplier_name: string;
    document_supplier_tax_id: string;
    document_customer_name: string;
    document_customer_tax_id: string;
  },
): string {
  const lines: string[] = [];
  const a = parties.document_supplier_name.trim();
  if (a) lines.push(`Proveedor (texto en documento): ${a}`);
  const b = parties.document_supplier_tax_id.trim();
  if (b) lines.push(`CIF/NIF proveedor: ${b}`);
  const c = parties.document_customer_name.trim();
  if (c) lines.push(`Cliente: ${c}`);
  const d = parties.document_customer_tax_id.trim();
  if (d) lines.push(`CIF/NIF cliente: ${d}`);
  const t = base.trim();
  if (lines.length === 0) return t;
  const block = ["--- Datos leídos del documento ---", ...lines].join("\n");
  return t ? `${t}\n\n${block}` : block;
}

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
  document_supplier_name: z.string().optional(),
  document_supplier_tax_id: z.string().optional(),
  document_customer_name: z.string().optional(),
  document_customer_tax_id: z.string().optional(),
  subtotal: optionalMoney,
  tax_amount: optionalMoney,
  total_amount: optionalMoney,
  lines: z.array(lineSchema).min(1, "Añade al menos una línea"),
});

type FormValues = z.infer<typeof schema>;

const STEPS = ["Datos", "Foto", "Revisar"] as const;

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

function applySupplierMappingToLine(
  line: FormValues["lines"][number],
  mappings: SupplierProductMappingLookup[],
  supplierId: string,
): FormValues["lines"][number] {
  if (line.ingredient_id?.trim() || !supplierId) return line;
  const raw = line.raw_name?.trim();
  if (!raw) return line;
  const hit = selectSupplierProductMapping(
    mappings,
    supplierId,
    normalizeSupplierProductName(raw),
  );
  if (!hit) return line;
  return { ...line, ingredient_id: hit.ingredient_id };
}

function mapOcrItemToLine(
  item: ExtractedPurchaseItem,
  ingredients: Ingredient[],
  mappings: SupplierProductMappingLookup[],
  supplierId: string,
): FormValues["lines"][number] {
  const sug = item.suggested_ingredient_name?.trim();
  let ingredient_id = "";
  if (sug) {
    const m = ingredients.find((i) => i.name.trim().toLowerCase() === sug.toLowerCase());
    if (m) ingredient_id = m.id;
  }
  const base: FormValues["lines"][number] = {
    raw_name: item.raw_name?.trim() || "",
    ingredient_id,
    quantity: item.quantity,
    quantity_unit: item.quantity_unit,
    unit_price: item.unit_price,
    total_price: item.total_price,
    needs_review: item.needs_review,
  };
  return applySupplierMappingToLine(base, mappings, supplierId);
}

function applyOcrDocumentToForm(d: NormalizedOcrExtraction["document"], setValue: UseFormSetValue<FormValues>) {
  if (d.document_number?.trim()) setValue("document_number", d.document_number.trim());
  if (d.document_date?.trim()) setValue("purchase_date", d.document_date.trim());
  if (d.supplier_name != null && String(d.supplier_name).trim())
    setValue("document_supplier_name", String(d.supplier_name).trim());
  if (d.supplier_tax_id != null && String(d.supplier_tax_id).trim())
    setValue("document_supplier_tax_id", String(d.supplier_tax_id).trim());
  if (d.customer_name != null && String(d.customer_name).trim())
    setValue("document_customer_name", String(d.customer_name).trim());
  if (d.customer_tax_id != null && String(d.customer_tax_id).trim())
    setValue("document_customer_tax_id", String(d.customer_tax_id).trim());
  if (d.subtotal != null) setValue("subtotal", d.subtotal);
  if (d.tax != null) setValue("tax_amount", d.tax);
  if (d.total != null) setValue("total_amount", d.total);
}

export function PurchaseForm({
  suppliers,
  ingredients,
  productMappings = [],
}: {
  suppliers: Supplier[];
  ingredients: Ingredient[];
  productMappings?: SupplierProductMappingLookup[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [ocrExtraction, setOcrExtraction] = useState<NormalizedOcrExtraction | null>(null);
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
      document_supplier_name: "",
      document_supplier_tax_id: "",
      document_customer_name: "",
      document_customer_tax_id: "",
      subtotal: undefined,
      tax_amount: undefined,
      total_amount: undefined,
      lines: [defaultLine()],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "lines",
  });

  const lineValues = useWatch({ control: form.control, name: "lines" }) ?? [];
  const supplierId = useWatch({ control: form.control, name: "supplier_id" });
  const documentType = useWatch({ control: form.control, name: "document_type" });

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
        const mergedNotes = appendDocumentPartiesToNotes(values.notes?.trim() ?? "", {
          document_supplier_name: values.document_supplier_name ?? "",
          document_supplier_tax_id: values.document_supplier_tax_id ?? "",
          document_customer_name: values.document_customer_name ?? "",
          document_customer_tax_id: values.document_customer_tax_id ?? "",
        });
        fd.set("notes", mergedNotes);
        fd.set("status", values.status);
        fd.set(
          "subtotal",
          values.subtotal != null && !Number.isNaN(values.subtotal) ? String(values.subtotal) : "",
        );
        fd.set(
          "tax_amount",
          values.tax_amount != null && !Number.isNaN(values.tax_amount) ? String(values.tax_amount) : "",
        );
        fd.set(
          "total_amount",
          values.total_amount != null && !Number.isNaN(values.total_amount) ? String(values.total_amount) : "",
        );
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

        if (ocrExtraction) {
          fd.set("extraction_source", "ocr_image");
          const draft = buildInvoiceOcrDraftFromReview(documentType, ocrExtraction, {
            document_supplier_name: values.document_supplier_name,
            document_supplier_tax_id: values.document_supplier_tax_id,
            document_customer_name: values.document_customer_name,
            document_customer_tax_id: values.document_customer_tax_id,
            document_number: values.document_number,
            purchase_date: values.purchase_date,
            subtotal: values.subtotal ?? null,
            tax_amount: values.tax_amount ?? null,
            total_amount: values.total_amount ?? null,
            lines: values.lines.map((l) => ({
              raw_name: l.raw_name,
              quantity: l.quantity,
              quantity_unit: l.quantity_unit,
              unit_price: l.unit_price,
              total_price: l.total_price,
              needs_review: l.needs_review,
            })),
          });
          fd.set("invoice_ocr_raw", JSON.stringify(draft));
        }

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
    [documentType, invoiceFile, ocrExtraction, router],
  );

  function nextFromStep0() {
    void form.trigger(["supplier_id", "document_type"]).then((ok) => {
      if (ok) setStep(1);
    });
  }

  function continueWithoutOcr() {
    setOcrExtraction(null);
    setStep(2);
  }

  function runLocalOcr() {
    void form.trigger(["supplier_id", "purchase_date", "document_type"]).then((ok) => {
      if (!ok) return;
      if (!invoiceFile || invoiceFile.size === 0) {
        toast.error("Selecciona una imagen primero");
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
        let json: unknown = null;
        try {
          json = await res.json();
        } catch {
          /* ignore */
        }
        if (!res.ok) {
          const errMsg =
            json &&
            typeof json === "object" &&
            json !== null &&
            "error" in json &&
            typeof (json as { error?: unknown }).error === "string"
              ? (json as { error: string }).error
              : "Error al extraer OCR";
          toast.error(errMsg);
          return;
        }
        const normalized = parseOcrHttpResponse(json);
        if (!normalized) {
          toast.error(MSG_BAD_IMAGE);
          return;
        }

        setOcrExtraction(normalized);
        applyOcrDocumentToForm(normalized.document, form.setValue);
        form.setValue("status", "pending_review");

        const items = normalized.items;
        const recon = normalized.reconstructed_lines ?? [];
        const reconHasText = recon.some((l) => l.trim().length > 0);
        const sid = form.getValues("supplier_id");
        const nextLines =
          items.length > 0
            ? items.map((it) => mapOcrItemToLine(it, ingredients, productMappings, sid))
            : [defaultLine()];
        replace(nextLines);

        if (items.length > 0) {
          toast.success(`Se han detectado ${items.length} línea${items.length === 1 ? "" : "s"}. Revisa los datos antes de guardar.`);
        } else if (reconHasText) {
          toast.message("Revisión necesaria", { description: MSG_LINES_NOT_PARSED });
        } else {
          toast.error(MSG_BAD_IMAGE);
        }
        setStep(2);
        router.refresh();
      });
    });
  }

  const supplierName = suppliers.find((s) => s.id === supplierId)?.name ?? "—";
  const linesSum = lineValues.reduce((s, ln) => s + (Number(ln?.total_price) || 0), 0);

  const ocrWarnings = ocrExtraction ? [...new Set(ocrExtraction.debug.warnings ?? [])] : [];
  const reconLines = ocrExtraction?.reconstructed_lines ?? [];
  const hasReconText = reconLines.some((l) => l.trim().length > 0);
  const showNoLinesButText =
    !!ocrExtraction && ocrExtraction.items.length === 0 && hasReconText;
  const showEmptyReconNoItems =
    !!ocrExtraction && ocrExtraction.items.length === 0 && !hasReconText;
  const showReconBlock = ocrExtraction != null && hasReconText;

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
        <p className="text-muted-foreground text-sm">
          Esta versión está pensada para trabajar con una <strong className="text-foreground">imagen</strong> del
          albarán o factura (foto o archivo de imagen). Revisa siempre los datos antes de guardar.
        </p>
        <div className="text-muted-foreground mt-2 flex flex-wrap gap-2 text-xs">
          {STEPS.map((label, i) => (
            <span
              key={label}
              className={cn(
                "rounded-full border px-2 py-0.5",
                i === step && "border-primary bg-primary/10 text-foreground font-medium",
                i < step && "border-muted-foreground/30 text-muted-foreground",
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
                  <Label htmlFor="supplier_id">Proveedor (en tu cuenta)</Label>
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
                <div className="space-y-2 sm:col-span-2">
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
              </div>
              <Button type="button" className="min-h-12 w-full text-base" onClick={nextFromStep0}>
                Siguiente: imagen
              </Button>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border bg-muted/20 p-4 text-sm">
                <p className="font-medium">Imagen del documento</p>
                <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5">
                  <li>Haz una foto del albarán/factura.</li>
                  <li>O adjunta una imagen existente.</li>
                </ul>
                <p className="text-muted-foreground mt-2 text-xs">
                  El flujo principal es imagen (JPEG, PNG, WebP…). No uses PDF como documento habitual para el OCR local.
                </p>
              </div>

              <div
                {...getRootProps()}
                className={cn(
                  "hidden cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 transition-colors md:flex",
                  isDragActive && "border-primary bg-primary/5",
                )}
              >
                <input {...getInputProps()} />
                <Upload className="text-muted-foreground size-8" aria-hidden />
                <span className="text-center text-sm font-medium">
                  Arrastra una imagen o elige archivo (sin PDF)
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
                  accept="image/*"
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
                  Haz una foto del albarán/factura
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-12 w-full gap-2 text-base"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="size-5" aria-hidden />
                  O adjunta una imagen existente
                </Button>
              </div>

              {invoiceFile ? (
                <p className="text-sm font-medium">Seleccionado: {invoiceFile.name}</p>
              ) : (
                <p className="text-muted-foreground text-sm">Ninguna imagen seleccionada.</p>
              )}

              <div className="rounded-md border border-dashed p-3">
                <p className="text-muted-foreground text-xs">
                  OCR en tu equipo (Docker). Los datos no se guardan en la compra hasta que confirmes al final.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-2 min-h-11 w-full sm:w-auto"
                  disabled={pending || !invoiceFile}
                  onClick={runLocalOcr}
                >
                  {pending ? "Extrayendo…" : "Extraer datos de la imagen"}
                </Button>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" className="min-h-12 flex-1" onClick={() => setStep(0)}>
                  Atrás
                </Button>
                <Button type="button" variant="outline" className="min-h-12 flex-1" onClick={continueWithoutOcr}>
                  Continuar sin escanear
                </Button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5">
              <OcrWarningsBanner warnings={ocrWarnings} />

              {showEmptyReconNoItems ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">{MSG_BAD_IMAGE}</p>
              ) : null}

              {showNoLinesButText ? (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">{MSG_LINES_NOT_PARSED}</p>
              ) : null}

              <div className="rounded-lg border bg-muted/15 p-4 space-y-4">
                <div>
                  <p className="text-sm font-medium">Revisión antes de guardar</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Cuenta: <span className="text-foreground font-medium">{supplierName}</span> · Tipo:{" "}
                    {DOCUMENT_LABELS[documentType]}
                  </p>
                </div>

                <div className="space-y-3 border-t pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Proveedor</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="document_supplier_name">Nombre o razón social</Label>
                      <Input id="document_supplier_name" className="min-h-11" {...form.register("document_supplier_name")} />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="document_supplier_tax_id">CIF / NIF</Label>
                      <Input id="document_supplier_tax_id" className="min-h-11" {...form.register("document_supplier_tax_id")} />
                    </div>
                  </div>

                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">Cliente</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="document_customer_name">Nombre o razón social</Label>
                      <Input id="document_customer_name" className="min-h-11" {...form.register("document_customer_name")} />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="document_customer_tax_id">CIF / NIF</Label>
                      <Input id="document_customer_tax_id" className="min-h-11" {...form.register("document_customer_tax_id")} />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 border-t pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documento</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="document_number">Número de documento</Label>
                      <Input id="document_number" className="min-h-11" {...form.register("document_number")} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="purchase_date">Fecha</Label>
                      <Input id="purchase_date" type="date" className="min-h-11" {...form.register("purchase_date")} />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 border-t pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Importes</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor="subtotal">Subtotal (€)</Label>
                      <Input id="subtotal" type="number" step="any" min={0} className="min-h-11" {...form.register("subtotal")} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="tax_amount">IVA (€)</Label>
                      <Input id="tax_amount" type="number" step="any" min={0} className="min-h-11" {...form.register("tax_amount")} />
                    </div>
                    <div className="space-y-1 sm:col-span-3 sm:max-w-md">
                      <Label htmlFor="total_amount">Total (€)</Label>
                      <Input
                        id="total_amount"
                        type="number"
                        step="any"
                        min={0}
                        className="min-h-11"
                        {...form.register("total_amount")}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1 border-t pt-3">
                  <Label htmlFor="notes">Notas (opcional)</Label>
                  <Input id="notes" className="min-h-11" {...form.register("notes")} />
                </div>
                {form.formState.errors.purchase_date ? (
                  <p className="text-destructive text-xs">{form.formState.errors.purchase_date.message}</p>
                ) : null}
              </div>

              {showReconBlock ? (
                <details className="rounded-lg border bg-muted/10 text-sm">
                  <summary className="cursor-pointer px-4 py-3 font-medium">Texto detectado (línea a línea)</summary>
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap border-t px-4 py-3 text-xs text-muted-foreground">
                    {reconLines.join("\n")}
                  </pre>
                </details>
              ) : null}

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <Label className="text-base">Líneas detectadas</Label>
                    <p className="text-muted-foreground text-xs">Producto, cantidad, unidad, precio unitario e importe (editables)</p>
                  </div>
                  <Button type="button" variant="outline" className="min-h-11 gap-1" onClick={() => append(defaultLine())}>
                    <Plus className="size-4" />
                    Añadir línea
                  </Button>
                </div>

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
                      {fields.map((field, index) => (
                        <TableRow key={field.id}>
                          <TableCell className="align-top">
                            <div className="flex flex-col gap-1">
                              {lineValues[index]?.needs_review ? (
                                <span className="w-fit rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-950 dark:text-amber-100">
                                  Revisar
                                </span>
                              ) : null}
                              {!lineValues[index]?.ingredient_id?.trim() ? (
                                <span className="w-fit rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                  Producto sin asociar
                                </span>
                              ) : null}
                              <Input
                                className="min-h-10"
                                placeholder="Ej. Lubina"
                                {...form.register(`lines.${index}.raw_name`)}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <Input
                              type="number"
                              step="any"
                              min={0}
                              className="min-h-10 text-right tabular-nums"
                              {...form.register(`lines.${index}.quantity`)}
                            />
                          </TableCell>
                          <TableCell className="align-top">
                            <select
                              className="border-input bg-background flex min-h-10 w-full rounded-lg border px-2 text-sm"
                              {...form.register(`lines.${index}.quantity_unit`)}
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
                              {...form.register(`lines.${index}.unit_price`)}
                            />
                          </TableCell>
                          <TableCell className="align-top">
                            <Input
                              type="number"
                              step="any"
                              min={0}
                              className="min-h-10 text-right tabular-nums"
                              {...form.register(`lines.${index}.total_price`)}
                            />
                          </TableCell>
                          <TableCell className="align-top">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              aria-label="Quitar línea"
                              disabled={fields.length <= 1}
                              onClick={() => remove(index)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex flex-col gap-4 md:hidden">
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
                          <Label className="text-xs font-medium">Producto</Label>
                          {lineValues[index]?.needs_review ? (
                            <span className="w-fit rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-950 dark:text-amber-100">
                              Revisar
                            </span>
                          ) : null}
                          {!lineValues[index]?.ingredient_id?.trim() ? (
                            <span className="w-fit rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                              Producto sin asociar
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
                          <Label className="text-xs">Unidad</Label>
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
                          <Label className="text-xs">Precio unitario (€)</Label>
                          <Input
                            type="number"
                            step="any"
                            min={0}
                            className="mt-1 min-h-12 text-base"
                            {...form.register(`lines.${index}.unit_price`)}
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <Label className="text-xs">Importe (€)</Label>
                          <Input
                            type="number"
                            step="any"
                            min={0}
                            className="mt-1 min-h-12 text-base"
                            {...form.register(`lines.${index}.total_price`)}
                          />
                        </div>
                        <div className="sm:col-span-12">
                          <Label className="text-xs">Mapear a ingrediente del catálogo (opcional)</Label>
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
                        <div className="sm:col-span-10">
                          <p className="text-muted-foreground text-xs">Comprobación</p>
                          <p className="mt-2 font-medium tabular-nums text-sm">
                            {unitPricePreview(qty, total)} / {unitLabel(qu)}
                          </p>
                        </div>
                        <div className="flex sm:col-span-2 sm:justify-end">
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
              </div>

              <div className="rounded-lg border bg-muted/20 p-4 tabular-nums text-sm">
                <p>
                  <span className="text-muted-foreground">Suma de líneas:</span>{" "}
                  <span className="font-medium">{formatMoneyEUR(linesSum)}</span>
                </p>
                <p className="text-muted-foreground mt-1 text-xs">Adjunto: {invoiceFile ? invoiceFile.name : "ninguno"}</p>
              </div>

              <fieldset className="space-y-2 rounded-lg border p-4">
                <legend className="text-foreground px-1 text-sm font-medium">Estado al guardar</legend>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="radio" className="size-4" value="confirmed" {...form.register("status")} />
                  <span>Confirmada (afecta costes de recetas si hay mapeo a ingredientes)</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="radio" className="size-4" value="pending_review" {...form.register("status")} />
                  <span>Pendiente de revisión (no alimenta último precio)</span>
                </label>
              </fieldset>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" className="min-h-12 flex-1" onClick={() => setStep(1)}>
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
