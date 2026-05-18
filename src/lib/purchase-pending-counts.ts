/** Agrupa purchase_id → líneas sin ingredient_id. */
export function pendingAssociationCountByPurchase(
  rows: Array<{ purchase_id: string }>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    counts.set(r.purchase_id, (counts.get(r.purchase_id) ?? 0) + 1);
  }
  return counts;
}
