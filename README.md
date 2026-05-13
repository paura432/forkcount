# IMD Cost Control

App interna (Next.js App Router + Supabase) para registrar compras, facturas, ingredientes y recetas con coste estimado a partir del último precio unitario.

## Supabase

1. Crea un proyecto en [Supabase](https://supabase.com) y copia **URL** y **anon key** en `.env.local` (ver [.env.example](.env.example)).
2. En el SQL Editor (o con [Supabase CLI](https://supabase.com/docs/guides/cli)), ejecuta la migración [supabase/migrations/20250513120000_init_imd_cost_control.sql](supabase/migrations/20250513120000_init_imd_cost_control.sql).
3. Auth: habilita **Email** (contraseña) para login/registro. Tras el primer usuario, el trigger crea `profiles` enlazado al restaurante demo `00000000-0000-4000-8000-000000000001`.
4. Storage: la migración define el bucket privado `invoices` y políticas por carpeta `restaurant_id/...`.

### CLI local (`supabase start`) con pnpm

En **pnpm 10** los scripts de dependencias pueden quedar bloqueados: el paquete `supabase` descarga el binario en su `postinstall`. Si `supabase: not found` o falta `node_modules/supabase/bin/supabase`:

```bash
pnpm approve-builds   # elige permitir builds para el paquete supabase (y otros que pida)
pnpm rebuild supabase # o: pnpm run db:rebuild-cli
```

No uses `npx supabase` en un repo gestionado con **pnpm** (resuelve otro árbol de `node_modules`). Usa:

```bash
pnpm exec supabase start
# o
pnpm run db:start
```

`supabase start` requiere **Docker** en marcha (stack local). Para el proyecto en la nube basta `.env.local` + SQL en el dashboard; el CLI local es opcional.

## Getting Started

Este proyecto usa **solo [pnpm](https://pnpm.io)** (`packageManager` en `package.json`; con [Corepack](https://nodejs.org/api/corepack.html): `corepack enable`). No uses `npm install` ni `yarn` en este repo.

Instala dependencias y arranca el servidor de desarrollo:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
