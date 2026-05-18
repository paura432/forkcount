import { normalizeSupplierProductName } from "./product-normalization";
import { parseInvoiceOcrDraft } from "./ocr-extraction";

/** Mapa nombre normalizado → needs_review según borrador OCR guardado en compra. */
export function ocrNeedsReviewByNormalizedName(
  invoiceOcrRaw: unknown,
): Map<string, boolean> {
  const draft = parseInvoiceOcrDraft(invoiceOcrRaw);
  const map = new Map<string, boolean>();
  if (!draft?.items) return map;
  for (const item of draft.items) {
    const raw = item.raw_name?.trim();
    if (!raw) continue;
    const key = normalizeSupplierProductName(raw);
    if (!key) continue;
    map.set(key, Boolean(item.needs_review));
  }
  return map;
}

export function lineNeedsOcrReview(
  rawName: string,
  needsReviewByName: Map<string, boolean>,
): boolean {
  const key = normalizeSupplierProductName(rawName);
  return key ? (needsReviewByName.get(key) ?? false) : false;
}
