/**
 * Fase 2: aquí se conectará extracción de líneas desde factura (OCR/IA).
 * MVP: no exportar funciones que llamen a red; solo tipos.
 */
export type { InvoiceOcrLineDraft, InvoiceOcrRawPayload, InvoiceOcrStatus } from "./types";

// phase 2: export async function extractLinesFromInvoice(_blob: Blob): Promise<InvoiceOcrRawPayload> { ... }
