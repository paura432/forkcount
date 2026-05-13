-- Forkcount: roles de mano de obra, líneas de manufactura en receta, aprovechamiento en BOM, PVP por ración.

-- -----------------------------------------------------------------------------
-- labor_roles
-- -----------------------------------------------------------------------------
create table public.labor_roles (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  hourly_cost numeric not null default 0 check (hourly_cost >= 0),
  created_at timestamptz not null default now()
);

create index idx_labor_roles_restaurant on public.labor_roles (restaurant_id);

alter table public.labor_roles enable row level security;

create policy "labor_roles_all_own_restaurant"
  on public.labor_roles for all
  using (restaurant_id = public.current_restaurant_id())
  with check (restaurant_id = public.current_restaurant_id());

-- -----------------------------------------------------------------------------
-- recipe_labor_items (calculated_cost mantenido por trigger: PG no permite generated con otras tablas)
-- -----------------------------------------------------------------------------
create table public.recipe_labor_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  labor_role_id uuid not null references public.labor_roles (id) on delete restrict,
  minutes numeric not null check (minutes > 0),
  calculated_cost numeric not null default 0 check (calculated_cost >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create index idx_recipe_labor_items_recipe on public.recipe_labor_items (recipe_id);
create index idx_recipe_labor_items_role on public.recipe_labor_items (labor_role_id);

alter table public.recipe_labor_items enable row level security;

create policy "recipe_labor_items_all_own_restaurant"
  on public.recipe_labor_items for all
  using (restaurant_id = public.current_restaurant_id())
  with check (restaurant_id = public.current_restaurant_id());

create or replace function public.set_recipe_labor_item_restaurant()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  select r.restaurant_id into new.restaurant_id
  from public.recipes r
  where r.id = new.recipe_id;
  return new;
end;
$$;

drop trigger if exists trg_recipe_labor_items_restaurant on public.recipe_labor_items;
create trigger trg_recipe_labor_items_restaurant
  before insert or update of recipe_id on public.recipe_labor_items
  for each row
  execute procedure public.set_recipe_labor_item_restaurant();

create or replace function public.compute_recipe_labor_item_cost()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  hc numeric;
begin
  select lr.hourly_cost into hc
  from public.labor_roles lr
  where lr.id = new.labor_role_id;

  if hc is null then
    new.calculated_cost := 0;
  else
    new.calculated_cost := (new.minutes / 60.0) * hc;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_recipe_labor_items_cost on public.recipe_labor_items;
create trigger trg_recipe_labor_items_cost
  before insert or update of minutes, labor_role_id on public.recipe_labor_items
  for each row
  execute procedure public.compute_recipe_labor_item_cost();

create or replace function public.propagate_labor_role_hourly_cost()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.hourly_cost is distinct from old.hourly_cost then
    update public.recipe_labor_items rli
    set calculated_cost = (rli.minutes / 60.0) * new.hourly_cost
    where rli.labor_role_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_labor_roles_propagate_cost on public.labor_roles;
create trigger trg_labor_roles_propagate_cost
  after update of hourly_cost on public.labor_roles
  for each row
  execute procedure public.propagate_labor_role_hourly_cost();

-- -----------------------------------------------------------------------------
-- recipe_items: aprovechamiento % (cantidad en receta = útil en plato)
-- -----------------------------------------------------------------------------
alter table public.recipe_items
  add column if not exists ingredient_yield_percentage numeric not null default 100
    check (ingredient_yield_percentage > 0 and ingredient_yield_percentage <= 100);

comment on column public.recipe_items.ingredient_yield_percentage is
  'Porcentaje aprovechable del bruto comprado; coste línea = qty * precio * (100/yield).';

-- -----------------------------------------------------------------------------
-- recipes: PVP por ración
-- -----------------------------------------------------------------------------
alter table public.recipes
  add column if not exists selling_price numeric
    check (selling_price is null or selling_price >= 0);

comment on column public.recipes.selling_price is 'Precio de venta público por ración (€), opcional.';

-- -----------------------------------------------------------------------------
-- RPC: coste total = ingredientes (con yield) + manufactura
-- -----------------------------------------------------------------------------
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
  rid as (select restaurant_id from r),
  prices as (
    select * from public.latest_unit_prices((select restaurant_id from rid))
  ),
  agg as (
    select
      ri.quantity * pr.unit_price * (100.0 / ri.ingredient_yield_percentage) as line_total,
      pr.unit_price
    from public.recipe_items ri
    left join prices pr on pr.ingredient_id = ri.ingredient_id
    where ri.recipe_id = p_recipe_id
      and ri.restaurant_id = (select restaurant_id from rid)
  ),
  labor as (
    select coalesce(sum(rli.calculated_cost), 0)::numeric as labor_total
    from public.recipe_labor_items rli
    where rli.recipe_id = p_recipe_id
      and rli.restaurant_id = (select restaurant_id from rid)
  )
  select case
    when not exists (select 1 from r) then null::numeric
    when exists (select 1 from agg where unit_price is null) then null::numeric
    else coalesce((select sum(line_total) from agg), 0)::numeric + (select labor_total from labor)
  end;
$$;

grant execute on function public.recipe_total_cost(uuid) to authenticated;
