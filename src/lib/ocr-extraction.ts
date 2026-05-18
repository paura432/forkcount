import { z } from "zod";
import type { PurchaseDocumentType } from "@/lib/types";
import { INGREDIENT_UNITS, PURCHASE_DOCUMENT_TYPES } from "@/lib/types";

const ocrBlockSchema = z.object({
  text: z.string(),
  confidence: z.number(),
  bbox: z.array(z.array(z.number())),
  x_center: z.number(),
  y_center: z.number(),
  width: z.number(),
  height: z.number(),
});

export type OcrBlock = z.infer<typeof ocrBlockSchema>;

/** Relaxed vs DB: OCR puede devolver cantidades/importes dudosos; el servidor valida al guardar. */
export const extractedPurchaseItemSchema = z.object({
  raw_name: z.string().default(""),
  quantity: z.coerce.number(),
  quantity_unit: z.enum(INGREDIENT_UNITS),
  unit_price: z.coerce.number(),
  total_price: z.coerce.number(),
  needs_review: z.boolean().optional().default(false),
  confidence: z.number().min(0).max(1).optional().default(0),
  suggested_ingredient_name: z.string().nullable().optional(),
});

export type ExtractedPurchaseItem = z.infer<typeof extractedPurchaseItemSchema>;

export const ocrDocumentSchema = z.object({
  supplier_name: z.string().nullable(),
  supplier_tax_id: z.string().nullable(),
  customer_name: z.string().nullable(),
  customer_tax_id: z.string().nullable(),
  document_number: z.string().nullable(),
  document_date: z.string().nullable(),
  subtotal: z.number().nullable(),
  tax: z.number().nullable(),
  total: z.number().nullable(),
});

export type OcrDocument = z.infer<typeof ocrDocumentSchema>;

/** Placeholder when the OCR service omits `document` (legacy responses). */
export const EMPTY_OCR_DOCUMENT: OcrDocument = {
  supplier_name: null,
  supplier_tax_id: null,
  customer_name: null,
  customer_tax_id: null,
  document_number: null,
  document_date: null,
  subtotal: null,
  tax: null,
  total: null,
};

const ocrDebugSchema = z.object({
  parser_used: z.string(),
  image_preprocessed: z.boolean(),
  row_count: z.number(),
  block_count: z.number(),
  warnings: z.array(z.string()).default([]),
});

export type OcrDebugInfo = z.infer<typeof ocrDebugSchema>;

/** Normalized shape used by Next after calling the Python service. */
export type NormalizedOcrExtraction = {
  ok: boolean;
  raw_text: string;
  text: string;
  reconstructed_lines: string[];
  lines: string[];
  blocks: OcrBlock[];
  items: ExtractedPurchaseItem[];
  document: OcrDocument;
  debug: OcrDebugInfo;
};

/** Raw JSON from FastAPI `/ocr/extract` (supports legacy `text` + `lines`). */
export const ocrServiceFlexibleSchema = z.object({
  ok: z.boolean().optional().default(true),
  raw_text: z.string().optional(),
  text: z.string().optional(),
  reconstructed_lines: z.array(z.string()).optional(),
  lines: z.array(z.string()).optional(),
  blocks: z.array(ocrBlockSchema).optional(),
  items: z.array(extractedPurchaseItemSchema),
  document: ocrDocumentSchema.optional(),
  debug: ocrDebugSchema.optional(),
});

export type OcrServiceFlexible = z.infer<typeof ocrServiceFlexibleSchema>;

/**
 * Maps Python `/ocr/extract` (and legacy `{ text, lines, items }`) into `NormalizedOcrExtraction`.
 */
export function normalizeOcrServiceResponse(raw: OcrServiceFlexible): NormalizedOcrExtraction | null {
  const rawText = (raw.raw_text ?? raw.text ?? "").trim();
  const recon = raw.reconstructed_lines ?? raw.lines ?? [];
  const blocks = raw.blocks ?? [];
  if (!rawText && recon.length === 0 && raw.items.length === 0) {
    return null;
  }
  const docParse = raw.document != null ? ocrDocumentSchema.safeParse(raw.document) : null;
  const document: OcrDocument = docParse?.success ? docParse.data : EMPTY_OCR_DOCUMENT;

  const fallbackDebug = {
    parser_used: "unknown",
    image_preprocessed: false,
    row_count: recon.length,
    block_count: blocks.length,
    warnings: [] as string[],
  } satisfies OcrDebugInfo;

  const debugParsed = raw.debug != null ? ocrDebugSchema.safeParse(raw.debug) : null;
  const debug: OcrDebugInfo = debugParsed?.success ? debugParsed.data : fallbackDebug;

  return {
    ok: raw.ok ?? true,
    raw_text: rawText,
    text: rawText,
    reconstructed_lines: recon,
    lines: recon,
    blocks,
    items: raw.items.map((it) => extractedPurchaseItemSchema.parse(it)),
    document,
    debug,
  };
}

export function parseOcrHttpResponse(json: unknown): NormalizedOcrExtraction | null {
  const p = ocrServiceFlexibleSchema.safeParse(json);
  if (!p.success) {
    return null;
  }
  return normalizeOcrServiceResponse(p.data);
}

const ocrDraftOcrSchema = z.object({
  text: z.string(),
  lines: z.array(z.string()),
  raw_text: z.string().optional(),
  reconstructed_lines: z.array(z.string()).optional(),
  blocks: z.array(z.unknown()).optional(),
  debug: z.record(z.string(), z.any()).optional(),
  document: ocrDocumentSchema.optional(),
});

/** Payload guardado en purchases.invoice_ocr_raw (borrador antes de confirmar líneas). */
export const invoiceOcrDraftSchema = z.object({
  version: z.literal(1),
  document_type: z.enum(PURCHASE_DOCUMENT_TYPES),
  created_at: z.string(),
  ocr: ocrDraftOcrSchema,
  items: z.array(extractedPurchaseItemSchema),
});

export type InvoiceOcrDraft = z.infer<typeof invoiceOcrDraftSchema>;

export function parseInvoiceOcrDraft(raw: unknown): InvoiceOcrDraft | null {
  const r = invoiceOcrDraftSchema.safeParse(raw);
  return r.success ? r.data : null;
}

export function buildInvoiceOcrDraft(
  document_type: PurchaseDocumentType,
  extraction: NormalizedOcrExtraction,
): InvoiceOcrDraft {
  return {
    version: 1,
    document_type,
    created_at: new Date().toISOString(),
    ocr: {
      text: extraction.text,
      lines: extraction.lines,
      raw_text: extraction.raw_text,
      reconstructed_lines: extraction.reconstructed_lines,
      blocks: extraction.blocks as unknown[],
      debug: extraction.debug as unknown as Record<string, unknown>,
      document: extraction.document,
    },
    items: extraction.items,
  };
}

export type OcrReviewPersistInput = {
  document_supplier_name?: string;
  document_supplier_tax_id?: string;
  document_customer_name?: string;
  document_customer_tax_id?: string;
  document_number?: string;
  purchase_date?: string;
  subtotal?: number | null;
  tax_amount?: number | null;
  total_amount?: number | null;
  lines: Array<{
    raw_name: string;
    quantity: number;
    quantity_unit: (typeof INGREDIENT_UNITS)[number];
    unit_price: number;
    total_price: number;
    needs_review?: boolean;
    suggested_ingredient_name?: string | null;
  }>;
};

/** Borrador OCR con cabecera e ítems ya editados en la UI de revisión. */
export function buildInvoiceOcrDraftFromReview(
  document_type: PurchaseDocumentType,
  extraction: NormalizedOcrExtraction | null,
  input: OcrReviewPersistInput,
): InvoiceOcrDraft {
  const document: OcrDocument = {
    supplier_name: input.document_supplier_name?.trim() || null,
    supplier_tax_id: input.document_supplier_tax_id?.trim() || null,
    customer_name: input.document_customer_name?.trim() || null,
    customer_tax_id: input.document_customer_tax_id?.trim() || null,
    document_number: input.document_number?.trim() || null,
    document_date: input.purchase_date?.trim() || null,
    subtotal: input.subtotal ?? null,
    tax: input.tax_amount ?? null,
    total: input.total_amount ?? null,
  };

  const items: ExtractedPurchaseItem[] = input.lines
    .filter((l) => l.raw_name.trim().length > 0)
    .map((l) =>
      extractedPurchaseItemSchema.parse({
        raw_name: l.raw_name.trim(),
        quantity: l.quantity,
        quantity_unit: l.quantity_unit,
        unit_price: l.unit_price,
        total_price: l.total_price,
        needs_review: l.needs_review ?? false,
        suggested_ingredient_name: l.suggested_ingredient_name ?? null,
      }),
    );

  const base = extraction;
  const debug = base?.debug ?? {
    parser_used: "unknown",
    image_preprocessed: false,
    row_count: 0,
    block_count: 0,
    warnings: [] as string[],
  };

  return {
    version: 1,
    document_type,
    created_at: new Date().toISOString(),
    ocr: {
      text: base?.text ?? "",
      lines: base?.reconstructed_lines ?? base?.lines ?? [],
      raw_text: base?.raw_text,
      reconstructed_lines: base?.reconstructed_lines,
      blocks: (base?.blocks ?? []) as unknown[],
      debug: debug as unknown as Record<string, unknown>,
      document,
    },
    items,
  };
}
