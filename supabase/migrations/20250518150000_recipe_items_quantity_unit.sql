-- FASE 8.1: unidad editable en líneas de receta (g/kg, ml/l, ud)

alter table public.recipe_items
  add column if not exists quantity_unit text;

update public.recipe_items ri
set quantity_unit = i.unit
from public.ingredients i
where i.id = ri.ingredient_id
  and ri.quantity_unit is null;

alter table public.recipe_items
  alter column quantity_unit set not null;

alter table public.recipe_items
  drop constraint if exists recipe_items_quantity_unit_check;

alter table public.recipe_items
  add constraint recipe_items_quantity_unit_check
  check (quantity_unit in ('g', 'kg', 'ml', 'l', 'ud'));

comment on column public.recipe_items.quantity_unit is
  'Unidad en la que se expresa quantity en la receta (puede diferir de ingredients.unit).';

-- Familia compatible: g/kg, ml/l, ud solo ud
create or replace function public.recipe_item_quantity_unit_family_ok(
  p_ingredient_id uuid,
  p_quantity_unit text
) returns boolean
language sql
stable
as $$
  select case i.unit
    when 'g' then p_quantity_unit in ('g', 'kg')
    when 'kg' then p_quantity_unit in ('g', 'kg')
    when 'ml' then p_quantity_unit in ('ml', 'l')
    when 'l' then p_quantity_unit in ('ml', 'l')
    when 'ud' then p_quantity_unit = 'ud'
    else false
  end
  from public.ingredients i
  where i.id = p_ingredient_id;
$$;

create or replace function public.check_recipe_item_quantity_unit_family()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.recipe_item_quantity_unit_family_ok(new.ingredient_id, new.quantity_unit) then
    raise exception 'quantity_unit % incompatible con unidad del ingrediente', new.quantity_unit;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_recipe_items_quantity_unit_family on public.recipe_items;
create trigger trg_recipe_items_quantity_unit_family
  before insert or update of ingredient_id, quantity_unit on public.recipe_items
  for each row
  execute function public.check_recipe_item_quantity_unit_family();

-- Conversión de cantidad entre unidades de la misma familia
create or replace function public.convert_ingredient_quantity(
  p_amount numeric,
  p_from_unit text,
  p_to_unit text
) returns numeric
language plpgsql
immutable
as $$
begin
  if p_from_unit is null or p_to_unit is null or p_amount is null then
    return null;
  end if;
  if p_from_unit = p_to_unit then
    return p_amount;
  end if;
  if p_from_unit = 'g' and p_to_unit = 'kg' then return p_amount / 1000.0; end if;
  if p_from_unit = 'kg' and p_to_unit = 'g' then return p_amount * 1000.0; end if;
  if p_from_unit = 'ml' and p_to_unit = 'l' then return p_amount / 1000.0; end if;
  if p_from_unit = 'l' and p_to_unit = 'ml' then return p_amount * 1000.0; end if;
  return null;
end;
$$;

-- RPC coste total con conversión quantity_unit → unidad del ingrediente
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
      public.convert_ingredient_quantity(ri.quantity, ri.quantity_unit, i.unit)
        * pr.unit_price
        * (100.0 / ri.ingredient_yield_percentage) as line_total,
      pr.unit_price,
      public.convert_ingredient_quantity(ri.quantity, ri.quantity_unit, i.unit) as converted_qty
    from public.recipe_items ri
    inner join public.ingredients i on i.id = ri.ingredient_id
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
    when exists (
      select 1 from agg where unit_price is null or converted_qty is null
    ) then null::numeric
    else coalesce((select sum(line_total) from agg), 0)::numeric + (select labor_total from labor)
  end;
$$;

grant execute on function public.convert_ingredient_quantity(numeric, text, text) to authenticated;
grant execute on function public.recipe_total_cost(uuid) to authenticated;
