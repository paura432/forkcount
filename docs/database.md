# Base de datos — Forkcount (Supabase)

## Fuente de verdad

- DDL acumulado en `supabase/migrations/` (orden cronológico). Inicial: `20250513120000_init_imd_cost_control.sql`; evolución compras/recetas: `20250513140000_*`, `20250513150000_*`; **mano de obra, merma y PVP**: `20250513160000_labor_roles_recipe_yield.sql`.
- Resumen comentado: `supabase/schema.sql`.

## Tablas

| Tabla                 | Rol breve                                                                 |
| --------------------- | ------------------------------------------------------------------------- |
| `restaurants`         | Tenant                                                                    |
| `profiles`            | `auth.users` → `restaurant_id`, rol                                       |
| `suppliers`           | Proveedores por restaurante                                             |
| `ingredients`         | Nombre + `unit` (check: g, kg, ml, l, ud)                                 |
| `purchases`           | Compra: proveedor, fecha, metadatos factura                             |
| `purchase_items`      | Líneas con precio/cantidad normalizados (ver migración 20250513150000)    |
| `recipes`             | Plato; `servings`, `selling_price` (PVP por ración, opcional)             |
| `recipe_items`        | BOM: `ingredient_id`, `quantity`, `ingredient_yield_percentage` (1–100)   |
| `labor_roles`         | Rol de trabajo: `name`, `hourly_cost` (≥ 0)                             |
| `recipe_labor_items`  | Tiempo de elaboración: `recipe_id`, `labor_role_id`, `minutes`, `notes`; `calculated_cost` |

### Aprovechamiento (merma)

En `recipe_items`, la **cantidad** es la **cantidad útil en plato**. El porcentaje `ingredient_yield_percentage` (por defecto 100) es el aprovechamiento del bruto comprado. Coste de línea en SQL y en `src/lib/costs.ts`:

`coste = quantity × unit_price × (100 / ingredient_yield_percentage)`.

Ejemplo: precio 32 €/kg en catálogo, 1 kg útil en receta con yield 80 % → coste de esa línea = 1 × 32 × (100/80) = 40 € (equivale a comprar 1,25 kg bruto).

### Manufactura

`recipe_labor_items.calculated_cost` se recalcula en **trigger** al insertar/actualizar `minutes` o `labor_role_id`, y al cambiar `hourly_cost` en `labor_roles` (propagación a líneas existentes).

Triggers rellenan `restaurant_id` en hijos desde la cabecera (`purchases` / `recipes` / `recipe_labor_items` desde `recipes`).

## RLS

Todas las tablas de negocio filtran por `restaurant_id = current_restaurant_id()`, derivado del perfil del usuario autenticado.

## RPC

- `latest_unit_prices(p_restaurant_id)` — último `unit_price` por ingrediente (en unidad de catálogo), compras confirmadas.
- `recipe_total_cost(p_recipe_id)` — suma costes de ingredientes **con yield** más la suma de `recipe_labor_items.calculated_cost`; devuelve `null` si falta precio para algún ingrediente de la receta.

## Storage

Bucket privado `invoices`: path `{restaurant_id}/...`; políticas por prefijo de carpeta.

## Tipos TS

Espejo del dominio en `src/lib/types.ts`; `src/types/*` reexporta para imports `@/types/...` existentes.
