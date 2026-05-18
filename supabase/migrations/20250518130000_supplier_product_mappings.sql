-- FASE 7: mapeo producto proveedor → ingrediente interno

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.supplier_product_mappings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  supplier_id uuid references public.suppliers (id) on delete cascade,
  raw_product_name text not null,
  normalized_raw_name text not null,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  conversion_factor numeric not null default 1 check (conversion_factor > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unicidad por restaurante + proveedor (null = mapping global) + nombre normalizado
create unique index supplier_product_mappings_restaurant_supplier_name_key
  on public.supplier_product_mappings (
    restaurant_id,
    coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid),
    normalized_raw_name
  );

create index idx_supplier_product_mappings_restaurant
  on public.supplier_product_mappings (restaurant_id);

create index idx_supplier_product_mappings_supplier
  on public.supplier_product_mappings (supplier_id);

create index idx_supplier_product_mappings_ingredient
  on public.supplier_product_mappings (ingredient_id);

create index idx_supplier_product_mappings_lookup
  on public.supplier_product_mappings (restaurant_id, normalized_raw_name);

create trigger supplier_product_mappings_updated_at
  before update on public.supplier_product_mappings
  for each row
  execute function public.update_updated_at_column();

alter table public.supplier_product_mappings enable row level security;

create policy "supplier_product_mappings_all_own_restaurant"
  on public.supplier_product_mappings for all
  using (restaurant_id = public.current_restaurant_id())
  with check (restaurant_id = public.current_restaurant_id());

comment on table public.supplier_product_mappings is
  'Asocia nombre de producto en documento de compra (por proveedor o global) a ingrediente del catálogo';
