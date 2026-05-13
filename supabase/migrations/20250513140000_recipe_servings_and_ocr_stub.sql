-- Forkcount: raciones en recetas + columnas reservadas OCR (sin lógica)

alter table public.recipes
  add column if not exists servings integer not null default 1
    check (servings >= 1);

update public.recipes set servings = 1 where servings is null;

alter table public.purchases
  add column if not exists invoice_ocr_status text not null default 'skipped',
  add column if not exists invoice_ocr_raw jsonb,
  add column if not exists invoice_ocr_error text;

comment on column public.purchases.invoice_ocr_status is 'Fase 2 OCR: pending|processing|done|error|skipped';
comment on column public.purchases.invoice_ocr_raw is 'Fase 2: payload parseado / líneas candidatas';
comment on column public.purchases.invoice_ocr_error is 'Fase 2: mensaje de error OCR';
