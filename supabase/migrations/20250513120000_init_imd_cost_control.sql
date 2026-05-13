-- IMD Cost Control — schema, RLS, storage policies, RPC
-- Fase 2: OCR / parseo factura (metadata adicional en purchases si hace falta)

-- Extensions
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Core: restaurant + profile (1 restaurant demo seed; nuevos users enlazados)
-- -----------------------------------------------------------------------------
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  role text not null default 'member',
  created_at timestamptz not null default now()
);

alter table public.restaurants enable row level security;
alter table public.profiles enable row level security;

-- Seed: un restaurante por defecto (todos los signups nuevos → este restaurante hasta UI multi-local)
insert into public.restaurants (id, name)
values ('00000000-0000-4000-8000-000000000001', 'Restaurante IMD')
on conflict (id) do nothing;

-- Nuevo usuario → perfil con restaurante seed
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_restaurant uuid := '00000000-0000-4000-8000-000000000001'::uuid;
begin
  insert into public.profiles (id, restaurant_id)
  values (new.id, default_restaurant)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- RLS restaurants: solo lectura del propio restaurante
create policy "restaurants_select_own"
  on public.restaurants for select
  using (
    id = (select restaurant_id from public.profiles where id = auth.uid())
  );

-- Profiles: cada uno ve/edita solo su fila
create policy "profiles_select_self"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_update_self"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- -----------------------------------------------------------------------------
-- Negocio
-- -----------------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  unit text not null check (unit in ('g', 'kg', 'ml', 'l', 'ud')),
  created_at timestamptz not null default now()
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  purchase_date date not null default (timezone('utc', now()))::date,
  invoice_path text,
  invoice_original_name text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  total_price numeric not null check (total_price >= 0),
  unit_price numeric not null check (unit_price >= 0),
  created_at timestamptz not null default now()
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  quantity numeric not null check (quantity >= 0),
  created_at timestamptz not null default now()
);

create index idx_suppliers_restaurant on public.suppliers (restaurant_id);
create index idx_ingredients_restaurant on public.ingredients (restaurant_id);
create index idx_purchases_restaurant_date on public.purchases (restaurant_id, purchase_date desc);
create index idx_purchase_items_ingredient on public.purchase_items (ingredient_id, purchase_id);
create index idx_recipes_restaurant on public.recipes (restaurant_id);
create index idx_recipe_items_recipe on public.recipe_items (recipe_id);

-- restaurant_id en hijos: trigger desde padre
create or replace function public.set_purchase_item_restaurant()
returns trigger language plpgsql as $$
begin
  select p.restaurant_id into new.restaurant_id
  from public.purchases p where p.id = new.purchase_id;
  return new;
end;
$$;

drop trigger if exists trg_purchase_items_restaurant on public.purchase_items;
create trigger trg_purchase_items_restaurant
  before insert or update of purchase_id on public.purchase_items
  for each row execute procedure public.set_purchase_item_restaurant();

create or replace function public.set_recipe_item_restaurant()
returns trigger language plpgsql as $$
begin
  select r.restaurant_id into new.restaurant_id
  from public.recipes r where r.id = new.recipe_id;
  return new;
end;
$$;

drop trigger if exists trg_recipe_items_restaurant on public.recipe_items;
create trigger trg_recipe_items_restaurant
  before insert or update of recipe_id on public.recipe_items
  for each row execute procedure public.set_recipe_item_restaurant();

-- -----------------------------------------------------------------------------
-- RLS helpers
-- -----------------------------------------------------------------------------
create or replace function public.current_restaurant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select restaurant_id from public.profiles where id = auth.uid() limit 1;
$$;

grant execute on function public.current_restaurant_id() to authenticated;

-- -----------------------------------------------------------------------------
-- RLS tablas negocio
-- -----------------------------------------------------------------------------
alter table public.suppliers enable row level security;
alter table public.ingredients enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_items enable row level security;

-- suppliers
create policy "suppliers_all_own_restaurant"
  on public.suppliers for all
  using (restaurant_id = public.current_restaurant_id())
  with check (restaurant_id = public.current_restaurant_id());

-- ingredients
create policy "ingredients_all_own_restaurant"
  on public.ingredients for all
  using (restaurant_id = public.current_restaurant_id())
  with check (restaurant_id = public.current_restaurant_id());

-- purchases
create policy "purchases_all_own_restaurant"
  on public.purchases for all
  using (restaurant_id = public.current_restaurant_id())
  with check (restaurant_id = public.current_restaurant_id());

-- purchase_items
create policy "purchase_items_all_own_restaurant"
  on public.purchase_items for all
  using (restaurant_id = public.current_restaurant_id())
  with check (restaurant_id = public.current_restaurant_id());

-- recipes
create policy "recipes_all_own_restaurant"
  on public.recipes for all
  using (restaurant_id = public.current_restaurant_id())
  with check (restaurant_id = public.current_restaurant_id());

-- recipe_items
create policy "recipe_items_all_own_restaurant"
  on public.recipe_items for all
  using (restaurant_id = public.current_restaurant_id())
  with check (restaurant_id = public.current_restaurant_id());

-- -----------------------------------------------------------------------------
-- RPC: último precio unitario por ingrediente (por fecha compra)
-- -----------------------------------------------------------------------------
create or replace function public.latest_unit_prices(p_restaurant_id uuid)
returns table (
  ingredient_id uuid,
  unit_price numeric,
  purchase_date date
)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (pi.ingredient_id)
    pi.ingredient_id,
    pi.unit_price,
    p.purchase_date
  from public.purchase_items pi
  join public.purchases p on p.id = pi.purchase_id
  where pi.restaurant_id = p_restaurant_id
    and p.restaurant_id = p_restaurant_id
  order by
    pi.ingredient_id,
    p.purchase_date desc,
    p.created_at desc,
    pi.created_at desc;
$$;

grant execute on function public.latest_unit_prices(uuid) to authenticated;

-- Opcional: coste total de una receta (usa último precio por ingrediente)
create or replace function public.recipe_total_cost(p_recipe_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  with r as (
    select restaurant_id from public.recipes where id = p_recipe_id limit 1
  ),
  prices as (
    select * from public.latest_unit_prices((select restaurant_id from r))
  ),
  agg as (
    select
      ri.quantity,
      pr.unit_price
    from public.recipe_items ri
    left join prices pr on pr.ingredient_id = ri.ingredient_id
    where ri.recipe_id = p_recipe_id
      and ri.restaurant_id = (select restaurant_id from r)
  )
  select case
    when exists (select 1 from agg where unit_price is null) then null
    else coalesce((select sum(quantity * unit_price) from agg), 0)::numeric
  end;
$$;

grant execute on function public.recipe_total_cost(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Storage: bucket facturas (privado)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "invoices_insert_own_folder" on storage.objects;
drop policy if exists "invoices_select_own_folder" on storage.objects;
drop policy if exists "invoices_update_own_folder" on storage.objects;
drop policy if exists "invoices_delete_own_folder" on storage.objects;

-- Primer segmento del path = restaurant_id del usuario
create policy "invoices_insert_own_folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = (select restaurant_id::text from public.profiles where id = auth.uid())
  );

create policy "invoices_select_own_folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = (select restaurant_id::text from public.profiles where id = auth.uid())
  );

create policy "invoices_update_own_folder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = (select restaurant_id::text from public.profiles where id = auth.uid())
  )
  with check (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = (select restaurant_id::text from public.profiles where id = auth.uid())
  );

create policy "invoices_delete_own_folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = (select restaurant_id::text from public.profiles where id = auth.uid())
  );
