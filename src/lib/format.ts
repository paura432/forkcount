export function formatMoneyEUR(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

export function unitLabel(unit: string): string {
  const map: Record<string, string> = {
    g: "g",
    kg: "kg",
    ml: "ml",
    l: "l",
    ud: "ud.",
  };
  return map[unit] ?? unit;
}
