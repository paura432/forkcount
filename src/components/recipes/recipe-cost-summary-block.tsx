import { Badge } from "@/components/ui/badge";
import { formatMoneyEUR } from "@/lib/format";
import {
  PROFITABILITY_LABEL,
  recipeProfitabilityStatus,
  type RecipeProfitabilityStatus,
} from "@/lib/recipe-profitability";
import type { RecipeCostSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

function statusBadgeVariant(
  status: RecipeProfitabilityStatus,
): "secondary" | "outline" | "default" | "destructive" {
  switch (status) {
    case "profitable":
      return "default";
    case "tight_margin":
      return "destructive";
    case "no_prices":
      return "outline";
    default:
      return "secondary";
  }
}

export function RecipeCostSummaryBlock({
  summary,
  title = "Resumen de fabricación",
  className,
}: {
  summary: RecipeCostSummary;
  title?: string;
  className?: string;
}) {
  const status = recipeProfitabilityStatus(summary);

  return (
    <section
      className={cn("space-y-3 rounded-lg border bg-muted/30 p-4", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <Badge variant={statusBadgeVariant(status)}>{PROFITABILITY_LABEL[status]}</Badge>
      </div>

      <dl className="grid gap-2 text-sm">
        <Row label="Materias primas sin merma" value={summary.ingredient_cost_naive} />
        <Row label="Ajuste por merma" value={summary.waste_adjustment_cost} />
        <Row label="Materias primas con merma" value={summary.ingredient_cost} />
        <Row label="Mano de obra" value={summary.labor_cost} />
        <Row label="Coste total de fabricación" value={summary.total_cost} strong />
        <Row label="Raciones" value={summary.servings} raw />
        <Row label="Coste por ración" value={summary.cost_per_serving} strong />
        <Row label="PVP por ración" value={summary.selling_price} />
        <Row label="Margen bruto por ración" value={summary.gross_margin} />
        <Row
          label="% coste sobre PVP"
          value={
            summary.food_cost_percentage == null
              ? null
              : `${summary.food_cost_percentage.toFixed(1)} %`
          }
        />
      </dl>

      {summary.missing_ingredient_ids.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          Faltan precios de compra en algún ingrediente. El escandallo es orientativo hasta
          registrar compras.
        </p>
      ) : null}
    </section>
  );
}

function Row({
  label,
  value,
  strong,
  raw,
}: {
  label: string;
  value: number | string | null | undefined;
  strong?: boolean;
  raw?: boolean;
}) {
  const display =
    value == null
      ? "—"
      : raw
        ? String(value)
        : typeof value === "number"
          ? formatMoneyEUR(value)
          : value;
  return (
    <div className="flex justify-between gap-3 border-b border-border/50 pb-2 last:border-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", strong && "font-semibold")}>{display}</dd>
    </div>
  );
}
