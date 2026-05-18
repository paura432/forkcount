-- Origen de extracción: compras creadas desde foto/imagen OCR en cliente.

alter table public.purchases
  drop constraint if exists purchases_extraction_source_check;

alter table public.purchases
  add constraint purchases_extraction_source_check
  check (extraction_source in ('manual', 'ocr', 'ocr_image'));
