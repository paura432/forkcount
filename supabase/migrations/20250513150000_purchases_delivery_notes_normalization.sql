-- Forkcount: compras como documentos (factura, albarán, …), líneas con raw_name,
-- normalización g/ml/ud para costes, status + extracción manual/OCR futura.

-- -----------------------------------------------------------------------------
-- purchases: cabecera ampliada
-- -----------------------------------------------------------------------------
alter table public.purchases
  add column if not exists document_type text not null default 'invoice',
  add column if not exists document_number text,
  add column if not exists subtotal numeric,
  add column if not exists tax_amount numeric,
  add column if not exists total_amount numeric,
  add column if not exists status text not null default 'confirmed',
  add column if not exists extraction_source text not null default 'manual';

alter table public.purchases
  drop constraint if exists purchases_document_type_check;

alter table public.purchases
  add constraint purchases_document_type_check
  check (document_type in ('invoice', 'delivery_note', 'receipt', 'order'));

alter table public.purchases
  drop constraint if exists purchases_status_check;

alter table public.purchases
  add constraint purchases_status_check
  check (status in ('draft', 'pending_review', 'confirmed'));

alter table public.purchases
  drop constraint if exists purchases_extraction_source_check;

alter table public.purchases
  add constraint purchases_extraction_source_check
  check (extraction_source in ('manual', 'ocr'));

comment on column public.purchases.invoice_ocr_status is
  'Extracción de documento (OCR/IA): pending|processing|done|error|skipped';
comment on column public.purchases.invoice_ocr_raw is
  'Payload parseado / líneas candidatas (OCR o sugerencias)';
comment on column public.purchases.invoice_ocr_error is
  'Mensaje de error si la extracción falla';

-- -----------------------------------------------------------------------------
-- purchase_items: nombre en documento, unidad de línea, normalizado, ingrediente opcional
-- -----------------------------------------------------------------------------
alter table public.purchase_items
  add column if not exists raw_name text,
  add column if not exists quantity_unit text,
  add column if not exists normalized_quantity numeric,
  add column if not exists normalized_unit text,
  add column if not exists normalized_unit_price numeric;

-- Permitir líneas solo de texto (sin ingrediente de catálogo)
alter table public.purchase_items
  alter column ingredient_id drop not null;

-- Backfill desde catálogo (filas existentes siempre tenían ingrediente)
update public.purchase_items pi
set
  raw_name = coalesce(i.name, ''),
  quantity_unit = i.unit,
  normalized_quantity = case i.unit
    when 'kg' then pi.quantity * 1000
    when 'g' then pi.quantity
    when 'l' then pi.quantity * 1000
    when 'ml' then pi.quantity
    when 'ud' then pi.quantity
  end,
  normalized_unit = case
    when i.unit in ('g', 'kg') then 'g'
    when i.unit in ('ml', 'l') then 'ml'
    else 'ud'
  end,
  normalized_unit_price = case
    when i.unit in ('g', 'kg') then pi.total_price / nullif(
      case i.unit when 'kg' then pi.quantity * 1000 when 'g' then pi.quantity end,
      0
    )
    when i.unit in ('ml', 'l') then pi.total_price / nullif(
      case i.unit when 'l' then pi.quantity * 1000 when 'ml' then pi.quantity end,
      0
    )
    when i.unit = 'ud' then pi.total_price / nullif(pi.quantity, 0)
  end
from public.ingredients i
where pi.ingredient_id = i.id
  and pi.raw_name is null;

-- Filas huérfanas teóricas
update public.purchase_items
set
  raw_name = coalesce(raw_name, ''),
  quantity_unit = 'ud',
  normalized_quantity = quantity,
  normalized_unit = 'ud',
  normalized_unit_price = case when quantity > 0 then total_price / quantity else 0 end
where raw_name is null or quantity_unit is null;

alter table public.purchase_items
  alter column raw_name set not null;

alter table public.purchase_items
  alter column quantity_unit set not null;

alter table public.purchase_items
  alter column normalized_quantity set not null;

alter table public.purchase_items
  alter column normalized_unit set not null;

alter table public.purchase_items
  alter column normalized_unit_price set not null;

alter table public.purchase_items
  drop constraint if exists purchase_items_quantity_unit_check;

alter table public.purchase_items
  add constraint purchase_items_quantity_unit_check
  check (quantity_unit in ('g', 'kg', 'ml', 'l', 'ud'));

alter table public.purchase_items
  drop constraint if exists purchase_items_normalized_unit_check;

alter table public.purchase_items
  add constraint purchase_items_normalized_unit_check
  check (normalized_unit in ('g', 'ml', 'ud'));

alter table public.purchase_items
  drop constraint if exists purchase_items_normalized_quantity_check;

alter table public.purchase_items
  add constraint purchase_items_normalized_quantity_check
  check (normalized_quantity > 0);

alter table public.purchase_items
  drop constraint if exists purchase_items_normalized_unit_price_check;

alter table public.purchase_items
  add constraint purchase_items_normalized_unit_price_check
  check (normalized_unit_price >= 0);

-- Coherencia: familia de quantity_unit vs normalized_unit
alter table public.purchase_items
  drop constraint if exists purchase_items_normalized_family_check;

alter table public.purchase_items
  add constraint purchase_items_normalized_family_check
  check (
    (quantity_unit in ('g', 'kg') and normalized_unit = 'g')
    or (quantity_unit in ('ml', 'l') and normalized_unit = 'ml')
    or (quantity_unit = 'ud' and normalized_unit = 'ud')
  );

-- -----------------------------------------------------------------------------
-- purchases: totales desde líneas existentes
-- -----------------------------------------------------------------------------
update public.purchases p
set
  subtotal = coalesce(s.sum_total, p.subtotal),
  total_amount = coalesce(s.sum_total, p.total_amount),
  tax_amount = coalesce(p.tax_amount, 0)
from (
  select purchase_id, sum(total_price)::numeric as sum_total
  from public.purchase_items
  group by purchase_id
) s
where p.id = s.purchase_id
  and (p.subtotal is null or p.total_amount is null);

-- -----------------------------------------------------------------------------
-- Trigger: ingrediente mapeado → misma familia de unidades que el ingrediente
-- -----------------------------------------------------------------------------
create or replace function public.check_purchase_item_ingredient_unit_family()
returns trigger
language plpgsql
as $$
declare
  ing_u text;
begin
  if new.ingredient_id is null then
    return new;
  end if;
  select i.unit into ing_u
  from public.ingredients i
  where i.id = new.ingredient_id
  limit 1;
  if not found then
    raise exception 'ingredient_id % not found', new.ingredient_id;
  end if;
  if (ing_u in ('g', 'kg') and new.quantity_unit not in ('g', 'kg'))
     or (ing_u in ('ml', 'l') and new.quantity_unit not in ('ml', 'l'))
     or (ing_u = 'ud' and new.quantity_unit <> 'ud') then
    raise exception 'quantity_unit % no compatible con ingrediente % (%)',
      new.quantity_unit, new.ingredient_id, ing_u;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_purchase_items_ingredient_unit on public.purchase_items;
create trigger trg_purchase_items_ingredient_unit
  before insert or update of ingredient_id, quantity_unit
  on public.purchase_items
  for each row
  execute procedure public.check_purchase_item_ingredient_unit_family();

-- -----------------------------------------------------------------------------
-- RPC: último precio por ingrediente (solo compras confirmadas, líneas mapeadas)
-- Precio devuelto en la unidad del catálogo del ingrediente (g, kg, ml, l, ud).
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
    case i.unit
      when 'g' then pi.normalized_unit_price
      when 'kg' then pi.normalized_unit_price * 1000
      when 'ml' then pi.normalized_unit_price
      when 'l' then pi.normalized_unit_price * 1000
      when 'ud' then pi.normalized_unit_price
    end::numeric as unit_price,
    p.purchase_date
  from public.purchase_items pi
  join public.purchases p on p.id = pi.purchase_id
  join public.ingredients i on i.id = pi.ingredient_id
  where pi.restaurant_id = p_restaurant_id
    and p.restaurant_id = p_restaurant_id
    and pi.ingredient_id is not null
    and p.status = 'confirmed'
    and (
      (i.unit in ('g', 'kg') and pi.normalized_unit = 'g')
      or (i.unit in ('ml', 'l') and pi.normalized_unit = 'ml')
      or (i.unit = 'ud' and pi.normalized_unit = 'ud')
    )
  order by
    pi.ingredient_id,
    p.purchase_date desc,
    p.created_at desc,
    pi.created_at desc;
$$;

grant execute on function public.latest_unit_prices(uuid) to authenticated;
