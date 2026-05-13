-- Forkcount — propuesta de esquema (referencia). Migraciones reales en supabase/migrations/.
-- Dominio: restaurante multi-tenant vía profiles.restaurant_id + RLS.

-- Extensiones
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Núcleo
-- -----------------------------------------------------------------------------
-- restaurants: tenant principal.
-- profiles: 1 fila por usuario auth; enlaza a restaurante y rol.

-- -----------------------------------------------------------------------------
-- Catálogo y compras
-- -----------------------------------------------------------------------------
-- suppliers: proveedores por restaurante.
-- ingredients: producto con unidad de coste (g, kg, ml, l, ud).
-- purchases: cabecera de compra / factura (metadata archivo: invoice_*).
-- purchase_items: líneas con normalización g/ml/ud; precio en unidad de catálogo (ver migraciones).

-- -----------------------------------------------------------------------------
-- Producción y coste
-- -----------------------------------------------------------------------------
-- recipes: plato; servings; selling_price (PVP por ración, opcional).
-- recipe_items: BOM; quantity en unidad del ingrediente; ingredient_yield_percentage (aprovechamiento %).
-- labor_roles: nombre + hourly_cost (€/h) por restaurante.
-- recipe_labor_items: minutos por rol; calculated_cost = (minutes/60)*hourly_cost (trigger).

-- -----------------------------------------------------------------------------
-- Funciones útiles (alineadas con migraciones)
-- -----------------------------------------------------------------------------
-- current_restaurant_id()
-- latest_unit_prices(restaurant_id)
-- recipe_total_cost(recipe_id) — ingredientes con yield + sum(calculated_cost) manufactura; null si falta precio.

-- -----------------------------------------------------------------------------
-- Evolución sugerida (solo diseño)
-- -----------------------------------------------------------------------------
-- ingredients: category_id, sku, allergens jsonb
-- purchases: currency text default 'EUR'
