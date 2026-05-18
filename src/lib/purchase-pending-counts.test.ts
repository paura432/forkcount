import { describe, expect, it } from "vitest";
import { pendingAssociationCountByPurchase } from "./purchase-pending-counts";

describe("pendingAssociationCountByPurchase", () => {
  it("counts rows per purchase", () => {
    const m = pendingAssociationCountByPurchase([
      { purchase_id: "p1" },
      { purchase_id: "p1" },
      { purchase_id: "p2" },
    ]);
    expect(m.get("p1")).toBe(2);
    expect(m.get("p2")).toBe(1);
  });
});
