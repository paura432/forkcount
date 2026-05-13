# Forkcount — plan de producto (IMD / restaurante)

## Visión

Herramienta de control de costes: compras con factura, catálogo de ingredientes, recetas y **coste de manufactura** por plato (materias primas con merma + mano de obra), con opción de PVP por ración y ratios de margen y coste alimentario.

## Stack confirmado

- Next.js App Router (`src/app/`), React 19, TypeScript 5.
- UI: Tailwind + componentes existentes; formularios con react-hook-form / zod cuando toque.
- Datos: Supabase (Postgres + Auth + Storage) cuando `.env.local` esté listo; la lógica de costes vive también en `src/lib/costs.ts` para tests y UI sin red.

## Arquitectura por features (carpetas sugeridas)

| Feature        | Responsabilidad                                      | Ubicación actual / notas        |
| -------------- | ---------------------------------------------------- | ------------------------------- |
| `auth`         | Sesión, perfil, `restaurant_id`                      | `src/app/login`, `lib/auth`     |
| `suppliers`    | CRUD proveedores                                     | `src/app/(app)/suppliers`       |
| `ingredients`  | CRUD ingredientes + unidad                           | `src/app/(app)/ingredients`     |
| `purchases`    | Compras, líneas, adjunto factura (sin OCR en fase 1) | `src/app/(app)/purchases`       |
| `labor-roles`  | Roles de trabajo y €/h                               | `src/app/(app)/labor-roles`     |
| `recipes`      | Recetas, BOM, yield, manufactura, PVP                | `src/app/(app)/recipes`         |
| `costing`      | Cálculos puros (coherencia línea, coste receta)      | `src/lib/costs.ts`, `units.ts`  |
| `types`        | Modelo de dominio TS                                 | `src/lib/types.ts` + reexports  |

No se añade OCR en esta fase. La extracción de líneas desde PDF/imagen será una feature posterior con cola o proveedor externo.

## Costing (resumen)

1. **Ingredientes**: último precio unitario por ingrediente (`latest_unit_prices`), conversión de unidad en la misma familia (masa/volumen) cuando hace falta (`units.ts`).
2. **Merma / aprovechamiento**: por línea de BOM, `ingredient_yield_percentage`; el coste real de materia incrementa según \(100/\text{yield}\) respecto al coste “naive” sin merma. La diferencia se muestra como ajuste por mermas en UI.
3. **Manufactura**: catálogo `labor_roles` (nombre, €/h); por receta, líneas `recipe_labor_items` (minutos por rol). Coste: \(\sum (\text{minutos}/60) \times \text{hourly\_cost}\), alineado con columna `calculated_cost` en base de datos.
4. **Totales**: coste total receta = coste ingredientes (con yield) + coste mano de obra; **coste por ración** = total / `servings`.
5. **PVP y márgenes** (opcional): `selling_price` por ración en `recipes`. **Margen bruto** = PVP − coste por ración. **% coste alimentario** = (coste por ración / PVP) × 100 cuando PVP > 0.

## Flujos clave

1. Alta de ingrediente con unidad de trabajo (g, kg, ml, l, ud).
2. Registro de compra: proveedor, fecha, líneas (cantidad, precio total o unitario); opcional subida de PDF a Storage.
3. Precio de referencia por ingrediente: última compra (`latest_unit_prices`) o media ponderada (helpers en `costs.ts`).
4. Definir roles de mano de obra y coste horario.
5. Receta: ingredientes con cantidad y % aprovechamiento; tiempos de elaboración por rol; raciones y PVP opcional.

## Próximos pasos (fuera de este ticket)

- Tests unitarios ampliados de `costs.ts` y `units.ts`.
- OCR / parseo de factura y reconciliación con líneas manuales.
