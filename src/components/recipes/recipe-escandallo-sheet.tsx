import { formatMoneyEUR, unitLabel } from "@/lib/format";
import type { RecipeCostBreakdown, RecipeCostSummary } from "@/lib/types";
import type { Ingredient } from "@/types/ingredient";
import type { LaborRole } from "@/types/recipe";
import { RecipeCostSummaryBlock } from "./recipe-cost-summary-block";

export function RecipeEscandalloSheet({
  recipeName,
  servings,
  sellingPrice,
  ingredients,
  breakdown,
  summary,
  laborRows,
  laborRoles,
}: {
  recipeName: string;
  servings: number;
  sellingPrice: number | null;
  ingredients: Ingredient[];
  breakdown: RecipeCostBreakdown;
  summary: RecipeCostSummary;
  laborRows: { labor_role_id: string; minutes: number; notes: string | null }[];
  laborRoles: LaborRole[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Ficha técnica</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Plato</dt>
            <dd className="font-medium">{recipeName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Raciones</dt>
            <dd className="font-medium tabular-nums">{servings}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">PVP por ración</dt>
            <dd className="font-medium tabular-nums">
              {sellingPrice != null ? formatMoneyEUR(sellingPrice) : "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <h3 className="font-semibold">Ingredientes</h3>
        <ul className="mt-3 flex flex-col gap-3">
          {breakdown.lines.map((line, idx) => {
            const ing = ingredients.find((i) => i.id === line.ingredient_id);
            const priceLabel =
              line.unit_price != null
                ? `${formatMoneyEUR(line.unit_price)}/${unitLabel(line.ingredient_unit)}`
                : "Sin precio de compra";
            return (
              <li
                key={`${line.ingredient_id}-${idx}`}
                className="rounded-md border bg-background px-3 py-2 text-sm"
              >
                <p className="font-medium">{ing?.name ?? "—"}</p>
                <p className="text-muted-foreground mt-1">
                  {line.quantity} {unitLabel(line.quantity_unit)} · Aprovechamiento{" "}
                  {line.ingredient_yield_percentage} %
                </p>
                <p className="text-muted-foreground text-xs">Último precio: {priceLabel}</p>
                <p className="mt-1 tabular-nums">
                  Sin merma:{" "}
                  {line.line_cost_naive != null ? formatMoneyEUR(line.line_cost_naive) : "—"} · Con
                  merma: {line.line_cost != null ? formatMoneyEUR(line.line_cost) : "—"}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <h3 className="font-semibold">Manufactura</h3>
        <p className="text-muted-foreground mt-1 text-xs">
          Coste de mano de obra = minutos / 60 × coste horario real (salario + seguros + cargas /
          horas productivas).
        </p>
        {laborRows.length === 0 ? (
          <p className="text-muted-foreground mt-3 text-sm">Sin tiempos registrados.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {laborRows.map((row, i) => {
              const role = laborRoles.find((r) => r.id === row.labor_role_id);
              const sub =
                role != null && row.minutes > 0
                  ? formatMoneyEUR((row.minutes / 60) * Number(role.hourly_cost))
                  : "—";
              return (
                <li
                  key={`${row.labor_role_id}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{role?.name ?? "Rol"}</span>
                    <span className="text-muted-foreground"> · {row.minutes} min</span>
                  </span>
                  <span className="text-muted-foreground tabular-nums text-xs">
                    {role != null ? `${formatMoneyEUR(role.hourly_cost)}/h` : "—"} → {sub}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <RecipeCostSummaryBlock summary={summary} />
    </div>
  );
}
