# Forkcount

App para restaurantes: convierte fotos de albaranes/facturas en costes reales de platos (compras → ingredientes → recetas → margen).

**Stack:** Next.js (Vercel) · Supabase (DB + auth + storage) · OCR en Cloud Run o Docker local (PaddleOCR).

## Requisitos

- Node.js ≥ 20
- [pnpm](https://pnpm.io) (`corepack enable`)
- Cuenta [Supabase](https://supabase.com)
- OCR local: [Docker](https://docs.docker.com/get-docker/) (opcional en desarrollo)

## Instalación local

```bash
pnpm install
cp .env.example .env.local
# Rellena NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY
pnpm dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Variables de entorno

Copia [.env.example](.env.example) a `.env.local`:

| Variable | Uso |
|----------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anon (pública en cliente) |
| `OCR_SERVICE_URL` | Base del microservicio OCR (local: `http://localhost:8001`) |
| `OCR_INTERNAL_SECRET` | Token compartido Next ↔ OCR (opcional en local) |
| `OCR_LANG` | Idioma PaddleOCR (`es` por defecto) |
| `DEBUG_OCR` | `true` para bloques de depuración en respuesta OCR |

**Nunca** subas `.env`, `.env.local` ni archivos con `service_role` al repositorio.

## Supabase — migraciones

Aplica **todas** las migraciones en orden (SQL Editor o CLI):

1. `20250513120000_init_imd_cost_control.sql`
2. `20250513140000_recipe_servings_and_ocr_stub.sql`
3. `20250513150000_purchases_delivery_notes_normalization.sql`
4. `20250513160000_labor_roles_recipe_yield.sql`
5. `20250518120000_purchases_extraction_source_ocr_image.sql`
6. `20250518130000_supplier_product_mappings.sql`
7. `20250518150000_recipe_items_quantity_unit.sql`

Carpeta: [supabase/migrations/](supabase/migrations/).

**Auth:** Email + contraseña. Tras el primer registro, el trigger crea `profiles` ligado al restaurante demo `00000000-0000-4000-8000-000000000001`.

**Storage:** bucket privado `invoices` (`restaurant_id/...`).

### CLI local (opcional)

```bash
pnpm approve-builds   # si pnpm 10 bloquea postinstall de supabase
pnpm rebuild supabase
pnpm run db:start     # requiere Docker
```

Usa `pnpm exec supabase …`, no `npx supabase`.

## OCR local (Docker)

Desde la raíz del repo:

```bash
docker compose up ocr --build
curl -s http://localhost:8001/health   # → {"ok":true}
```

Detalle: [docs/ocr-local.md](docs/ocr-local.md).

En `.env.local`: `OCR_SERVICE_URL=http://localhost:8001` y, si usas compose con secret, el mismo `OCR_INTERNAL_SECRET` en ambos lados.

## Despliegue en Vercel

1. Importa el repo y usa **pnpm** como instalador.
2. Variables de entorno (Production + Preview):

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `OCR_SERVICE_URL` → URL pública de Cloud Run (HTTPS)
   - `OCR_INTERNAL_SECRET` → mismo valor que en Cloud Run
   - `OCR_LANG=es`
   - `DEBUG_OCR=false`

3. `pnpm build` debe pasar en CI (ver scripts abajo).

## OCR en Cloud Run

El servicio Python vive en [services/ocr/](services/ocr/). Imagen Docker escucha en puerto **8001** (`PORT`).

Flujo típico:

1. Build y push de la imagen a Artifact Registry.
2. Desplegar servicio Cloud Run con `PORT=8001`, `OCR_LANG=es`, `OCR_INTERNAL_SECRET` (si aplica).
3. Copiar la URL del servicio en `OCR_SERVICE_URL` de Vercel.
4. Comprobar: `GET {OCR_SERVICE_URL}/health` y subida de imagen vía app → `/api/purchases/ocr`.

## Scripts

```bash
pnpm dev          # desarrollo
pnpm build        # build producción
pnpm start        # servir build
pnpm lint         # ESLint
pnpm test         # Vitest
```

## Seguridad

Si alguna clave de Supabase pudo quedar expuesta en git, **rota** anon y service_role en el dashboard de Supabase y actualiza Vercel/.env.local. Ver [docs/security.md](docs/security.md).
