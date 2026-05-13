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

export const extractedPurchaseItemSchema = z.object({
  raw_name: z.string().min(1),
  quantity: z.number().positive(),
  quantity_unit: z.enum(INGREDIENT_UNITS),
  unit_price: z.number().nonnegative(),
  total_price: z.number().nonnegative(),
  needs_review: z.boolean().optional().default(false),
  confidence: z.number().min(0).max(1).optional().default(0),
  suggested_ingredient_name: z.string().nullable().optional(),
});

export type ExtractedPurchaseItem = z.infer<typeof extractedPurchaseItemSchema>;

const ocrDebugSchema = z.object({
  parser_used: z.string(),
  image_preprocessed: z.boolean(),
  row_count: z.number(),
  block_count: z.number(),
});

export type OcrDebugInfo = z.infer<typeof ocrDebugSchema>;

/** Normalized shape used by Next after calling the Python service. */
export type NormalizedOcrExtraction = {
  raw_text: string;
  text: string;
  reconstructed_lines: string[];
  lines: string[];
  blocks: OcrBlock[];
  items: ExtractedPurchaseItem[];
  debug: OcrDebugInfo;
};

/** Raw JSON from FastAPI `/ocr/extract` (supports legacy `text` + `lines`). */
export const ocrServiceFlexibleSchema = z.object({
  raw_text: z.string().optional(),
  text: z.string().optional(),
  reconstructed_lines: z.array(z.string()).optional(),
  lines: z.array(z.string()).optional(),
  blocks: z.array(ocrBlockSchema).optional(),
  items: z.array(extractedPurchaseItemSchema),
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
  const debug: OcrDebugInfo =
    raw.debug ??
    ({
      parser_used: "unknown",
      image_preprocessed: false,
      row_count: recon.length,
      block_count: blocks.length,
    } satisfies OcrDebugInfo);

  return {
    raw_text: rawText,
    text: rawText,
    reconstructed_lines: recon,
    lines: recon,
    blocks,
    items: raw.items.map((it) => extractedPurchaseItemSchema.parse(it)),
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
    },
    items: extraction.items,
  };
}
