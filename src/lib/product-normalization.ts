/**
 * Normaliza nombres de producto en albaranes/facturas para búsqueda y mapeos.
 */
export function normalizeSupplierProductName(raw: string): string {
  let s = raw.trim().toLowerCase();
  if (!s) return "";

  s = s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[,;:|/\\()[\]{}'"`´¨^°#@$%&*+=<>~!?¿¡]/g, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Variantes simples frecuentes en albaranes
  const replacements: [RegExp, string][] = [
    [/\blts?\b/g, "ltr"],
    [/\blt\b/g, "ltr"],
    [/\bunid\.?\b/g, "ud"],
    [/\bunds?\.?\b/g, "ud"],
    [/\bkilos?\b/g, "kg"],
    [/\bgramos?\b/g, "g"],
    [/\blitros?\b/g, "l"],
  ];
  for (const [re, rep] of replacements) {
    s = s.replace(re, rep);
  }

  return s.replace(/\s+/g, " ").trim();
}

/** Nombre legible para ingrediente nuevo (p. ej. "LUBINA" → "Lubina"). */
export function defaultIngredientNameFromRaw(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  return t
    .split(/\s+/)
    .map((w) => {
      const lower = w.toLowerCase();
      if (lower.length <= 3 && lower === lower.toUpperCase()) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}
