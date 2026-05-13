"use client";

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type SpendPoint = { month: string; total: number };

export function DashboardSpendChart({ data }: { data: SpendPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        Sin líneas de compra aún. El gráfico mostrará el gasto mensual sumando totales de línea.
      </p>
    );
  }

  return (
    <div className="h-64 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <XAxis dataKey="month" tick={{ fontSize: 11 }} interval={0} angle={-28} textAnchor="end" height={48} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => `${v}€`}
            width={48}
          />
          <Tooltip
            formatter={(value) => {
              const n = typeof value === "number" ? value : Number(value);
              return Number.isFinite(n) ? [`${n.toFixed(2)} €`, "Gasto"] : ["—", ""];
            }}
            labelFormatter={(label) => String(label)}
          />
          <Bar dataKey="total" name="Gasto" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
