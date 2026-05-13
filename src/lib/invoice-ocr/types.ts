/**
 * Fase 2 OCR / IA — tipos reservados. No hay pipeline activo.
 */

export type InvoiceOcrStatus =
  | "skipped"
  | "pending"
  | "processing"
  | "done"
  | "error";

/** Línea candidata post-OCR (no usada en MVP). */
export type InvoiceOcrLineDraft = {
  raw_label?: string;
  ingredient_hint?: string;
  quantity?: number;
  total_price?: number;
};

export type InvoiceOcrRawPayload = {
  version: 1;
  lines?: InvoiceOcrLineDraft[];
  meta?: Record<string, unknown>;
};
