"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getRestaurantId } from "@/lib/auth/restaurant";
import { purchaseLineCoherent } from "@/lib/costs";
import { normalizePurchaseLine } from "@/lib/purchase-normalization";
import { parseInvoiceOcrDraft } from "@/lib/ocr-extraction";
import { EXTRACTION_SOURCES, PURCHASE_DOCUMENT_TYPES, type ExtractionSource, type IngredientUnit } from "@/lib/types";
import { isIngredientUnit } from "@/lib/units";

/** Tolerancia € para cantidad × precio unitario en compras OCR (redondeo / heurísticas). */
const OCR_LINE_COHERENCE_ABS = 0.02;

const ingredientIdField = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.string().uuid().nullable(),
);

const lineSchema = z.object({
  raw_name: z.string().trim().min(1, "Nombre de línea obligatorio"),
  ingredient_id: ingredientIdField,
  quantity: z.coerce.number().positive(),
  quantity_unit: z
    .string()
    .refine((u): u is IngredientUnit => isIngredientUnit(u), "Unidad inválida"),
  unit_price: z.coerce.number().nonnegative(),
  total_price: z.coerce.number().nonnegative(),
});

const purchaseSchema = z.object({
  supplier_id: z.string().uuid(),
  purchase_date: z.string().min(1),
  document_type: z.enum(PURCHASE_DOCUMENT_TYPES),
  document_number: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["confirmed", "pending_review"]),
  subtotal: z.coerce.number().nonnegative().optional().nullable(),
  tax_amount: z.coerce.number().nonnegative().optional().nullable(),
  total_amount: z.coerce.number().nonnegative().optional().nullable(),
  lines: z.array(lineSchema).min(1, "Añade al menos una línea"),
});

export type PurchaseActionState = { error?: string; ok?: boolean; purchaseId?: string };

function roundUnitPrice(total: number, qty: number): number {
  if (qty <= 0) return 0;
  return Math.round((total / qty) * 10000) / 10000;
}

function roundNormalizedUnitPrice(v: number): number {
  return Math.round(v * 1e8) / 1e8;
}

function safeFileName(name: string): string {
  const base = name.replace(/[^\w.\-]+/g, "_").slice(0, 180);
  return base || "factura";
}

function parseExtractionSource(raw: FormDataEntryValue | null): ExtractionSource {
  const v = typeof raw === "string" ? raw.trim() : "";
  if ((EXTRACTION_SOURCES as readonly string[]).includes(v)) {
    return v as ExtractionSource;
  }
  return "manual";
}

export async function createPurchase(
  _prev: PurchaseActionState,
  formData: FormData
): Promise<PurchaseActionState> {
  const linesRaw = formData.get("lines");
  let lines: unknown;
  try {
    lines = typeof linesRaw === "string" ? JSON.parse(linesRaw) : [];
  } catch {
    return { error: "Líneas inválidas" };
  }

  const statusRaw = formData.get("status");
  const statusParsed = z.enum(["confirmed", "pending_review"]).safeParse(
    typeof statusRaw === "string" ? statusRaw : "confirmed",
  );
  const status = statusParsed.success ? statusParsed.data : "confirmed";

  const parsed = purchaseSchema.safeParse({
    supplier_id: formData.get("supplier_id"),
    purchase_date: formData.get("purchase_date"),
    document_type: formData.get("document_type"),
    document_number: (formData.get("document_number") as string) || undefined,
    notes: (formData.get("notes") as string) || undefined,
    status,
    subtotal: formData.get("subtotal") === "" ? null : formData.get("subtotal"),
    tax_amount: formData.get("tax_amount") === "" ? null : formData.get("tax_amount"),
    total_amount: formData.get("total_amount") === "" ? null : formData.get("total_amount"),
    lines,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  for (const l of parsed.data.lines) {
    if (!purchaseLineCoherent(l.quantity, l.unit_price, l.total_price)) {
      return {
        error: `Línea "${l.raw_name}": cantidad × precio no coincide con el total`,
      };
    }
  }

  const linesSum = parsed.data.lines.reduce((s, l) => s + l.total_price, 0);
  let subtotal = parsed.data.subtotal ?? null;
  let tax_amount = parsed.data.tax_amount ?? null;
  let total_amount = parsed.data.total_amount ?? null;
  if (subtotal === null || subtotal === undefined) {
    subtotal = Math.round(linesSum * 10000) / 10000;
  }
  if (tax_amount === null || tax_amount === undefined) {
    tax_amount = 0;
  }
  if (total_amount === null || total_amount === undefined) {
    total_amount = Math.round((subtotal + tax_amount) * 10000) / 10000;
  }

  const restaurant_id = await getRestaurantId();
  const supabase = await createClient();

  const extraction_source = parseExtractionSource(formData.get("extraction_source"));
  let invoice_ocr_raw: unknown = null;
  let invoice_ocr_status: "skipped" | "done" = "skipped";
  const ocrRawField = formData.get("invoice_ocr_raw");
  if (typeof ocrRawField === "string" && ocrRawField.trim()) {
    try {
      const draft = parseInvoiceOcrDraft(JSON.parse(ocrRawField));
      if (draft) {
        invoice_ocr_raw = draft;
        invoice_ocr_status = "done";
      }
    } catch {
      return { error: "Datos OCR inválidos" };
    }
  }

  const { data: purchase, error: pErr } = await supabase
    .from("purchases")
    .insert({
      restaurant_id,
      supplier_id: parsed.data.supplier_id,
      purchase_date: parsed.data.purchase_date,
      document_type: parsed.data.document_type,
      document_number: parsed.data.document_number?.trim() || null,
      subtotal,
      tax_amount,
      total_amount,
      status: parsed.data.status,
      extraction_source,
      invoice_ocr_raw,
      invoice_ocr_status,
      notes: parsed.data.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (pErr || !purchase) return { error: pErr?.message ?? "No se creó la compra" };

  const rows = parsed.data.lines.map((l) => {
    const norm = normalizePurchaseLine({
      quantity: l.quantity,
      quantity_unit: l.quantity_unit,
      unit_price: l.unit_price,
      total_price: l.total_price,
    });
    return {
      purchase_id: purchase.id,
      ingredient_id: l.ingredient_id,
      raw_name: l.raw_name.trim(),
      quantity: l.quantity,
      quantity_unit: l.quantity_unit,
      total_price: l.total_price,
      unit_price: roundUnitPrice(l.total_price, l.quantity),
      normalized_quantity: norm.normalized_quantity,
      normalized_unit: norm.normalized_unit,
      normalized_unit_price: roundNormalizedUnitPrice(norm.normalized_unit_price),
    };
  });

  const { error: iErr } = await supabase.from("purchase_items").insert(rows);
  if (iErr) {
    await supabase.from("purchases").delete().eq("id", purchase.id);
    return { error: iErr.message };
  }

  const invoice = formData.get("invoice");
  if (invoice instanceof File && invoice.size > 0) {
    const original = invoice.name;
    const objectPath = `${restaurant_id}/${purchase.id}/${safeFileName(original)}`;
    const buf = Buffer.from(await invoice.arrayBuffer());
    const { error: uErr } = await supabase.storage
      .from("invoices")
      .upload(objectPath, buf, {
        contentType: invoice.type || "application/octet-stream",
        upsert: false,
      });
    if (uErr) {
      return { error: `Compra creada pero documento no subido: ${uErr.message}`, purchaseId: purchase.id };
    }
    await supabase
      .from("purchases")
      .update({
        invoice_path: objectPath,
        invoice_original_name: original,
      })
      .eq("id", purchase.id);
  }

  revalidatePath("/purchases");
  revalidatePath("/purchases/new");
  revalidatePath(`/purchases/${purchase.id}`);
  revalidatePath("/recipes");
  revalidatePath("/dashboard");
  return { ok: true, purchaseId: purchase.id };
}

const confirmOcrLineSchema = z.object({
  raw_name: z.string().trim().min(1, "Nombre de línea obligatorio"),
  ingredient_id: ingredientIdField,
  quantity: z.coerce.number().positive(),
  quantity_unit: z
    .string()
    .refine((u): u is IngredientUnit => isIngredientUnit(u), "Unidad inválida"),
  unit_price: z.coerce.number().nonnegative(),
  total_price: z.coerce.number().nonnegative(),
});

const confirmOcrSchema = z.object({
  purchaseId: z.string().uuid(),
  status: z.enum(["confirmed", "pending_review"]),
  document_number: z.string().optional(),
  purchase_date: z.string().optional(),
  notes: z.string().optional(),
  subtotal: z.coerce.number().nonnegative().optional().nullable(),
  tax_amount: z.coerce.number().nonnegative().optional().nullable(),
  total_amount: z.coerce.number().nonnegative().optional().nullable(),
  invoice_ocr_raw: z.unknown().optional(),
  lines: z.array(confirmOcrLineSchema).min(1, "Añade al menos una línea"),
});

export type ConfirmOcrPurchaseResult = { error?: string; ok?: boolean };

export async function confirmOcrPurchase(
  input: z.infer<typeof confirmOcrSchema>,
): Promise<ConfirmOcrPurchaseResult> {
  const parsed = confirmOcrSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  for (const l of parsed.data.lines) {
    if (
      !purchaseLineCoherent(l.quantity, l.unit_price, l.total_price, {
        toleranceAbs: OCR_LINE_COHERENCE_ABS,
      })
    ) {
      return {
        error: `Línea "${l.raw_name}": cantidad × precio no coincide con el total`,
      };
    }
  }

  const linesSum = parsed.data.lines.reduce((s, l) => s + l.total_price, 0);
  let subtotal = parsed.data.subtotal ?? null;
  let tax_amount = parsed.data.tax_amount ?? null;
  let total_amount = parsed.data.total_amount ?? null;
  if (subtotal === null || subtotal === undefined) {
    subtotal = Math.round(linesSum * 10000) / 10000;
  }
  if (tax_amount === null || tax_amount === undefined) {
    tax_amount = 0;
  }
  if (total_amount === null || total_amount === undefined) {
    total_amount = Math.round((subtotal + tax_amount) * 10000) / 10000;
  }

  const restaurant_id = await getRestaurantId();
  const supabase = await createClient();

  const { count: existingCount, error: countErr } = await supabase
    .from("purchase_items")
    .select("id", { count: "exact", head: true })
    .eq("purchase_id", parsed.data.purchaseId);

  if (countErr) return { error: countErr.message };
  if (existingCount && existingCount > 0) {
    return { error: "Esta compra ya tiene líneas registradas" };
  }

  const { data: purchase, error: pErr } = await supabase
    .from("purchases")
    .select("id, restaurant_id, extraction_source")
    .eq("id", parsed.data.purchaseId)
    .maybeSingle();

  if (pErr || !purchase) return { error: pErr?.message ?? "Compra no encontrada" };
  if (purchase.restaurant_id !== restaurant_id) {
    return { error: "No autorizado" };
  }
  if (purchase.extraction_source !== "ocr" && purchase.extraction_source !== "ocr_image") {
    return { error: "Solo compras creadas por OCR usan esta confirmación" };
  }

  const rows = parsed.data.lines.map((l) => {
    const norm = normalizePurchaseLine(
      {
        quantity: l.quantity,
        quantity_unit: l.quantity_unit,
        unit_price: l.unit_price,
        total_price: l.total_price,
      },
      { coherenceToleranceAbs: OCR_LINE_COHERENCE_ABS },
    );
    return {
      purchase_id: parsed.data.purchaseId,
      ingredient_id: l.ingredient_id,
      raw_name: l.raw_name.trim(),
      quantity: l.quantity,
      quantity_unit: l.quantity_unit,
      total_price: l.total_price,
      unit_price: roundUnitPrice(l.total_price, l.quantity),
      normalized_quantity: norm.normalized_quantity,
      normalized_unit: norm.normalized_unit,
      normalized_unit_price: roundNormalizedUnitPrice(norm.normalized_unit_price),
    };
  });

  const { error: iErr } = await supabase.from("purchase_items").insert(rows);
  if (iErr) return { error: iErr.message };

  let invoice_ocr_raw: unknown = undefined;
  if (parsed.data.invoice_ocr_raw != null) {
    const draft = parseInvoiceOcrDraft(parsed.data.invoice_ocr_raw);
    if (!draft) return { error: "Datos OCR inválidos" };
    invoice_ocr_raw = draft;
  }

  const purchasePatch: Record<string, unknown> = {
    subtotal,
    tax_amount,
    total_amount,
    status: parsed.data.status,
  };
  if (parsed.data.document_number !== undefined) {
    purchasePatch.document_number = parsed.data.document_number.trim() || null;
  }
  if (parsed.data.purchase_date?.trim()) {
    purchasePatch.purchase_date = parsed.data.purchase_date.trim();
  }
  if (parsed.data.notes !== undefined) {
    purchasePatch.notes = parsed.data.notes.trim() || null;
  }
  if (invoice_ocr_raw !== undefined) {
    purchasePatch.invoice_ocr_raw = invoice_ocr_raw;
    purchasePatch.invoice_ocr_status = "done";
  }

  const { error: uErr } = await supabase
    .from("purchases")
    .update(purchasePatch)
    .eq("id", parsed.data.purchaseId);

  if (uErr) return { error: uErr.message };

  revalidatePath("/purchases");
  revalidatePath("/purchases/new");
  revalidatePath(`/purchases/${parsed.data.purchaseId}`);
  revalidatePath("/recipes");
  revalidatePath("/dashboard");
  return { ok: true };
}
