# Seguridad — Forkcount

## Claves en el repositorio

- **Nunca** commitear `.env`, `.env.local`, `Untitled` ni dumps con `SUPABASE_SERVICE_ROLE_KEY`.
- Solo `NEXT_PUBLIC_*` y secretos de despliegue van en Vercel / Secret Manager, no en git.

## Si hubo exposición en GitHub

1. En [Supabase](https://supabase.com/dashboard) → proyecto → **Settings → API**:
   - Regenera **anon** y **service_role**.
2. Actualiza **Vercel** (y `.env.local` de cada desarrollador) con la nueva anon key.
3. Revisa logs de acceso anómalo en Supabase.
4. El historial de git puede haberse purgado con `git filter-repo`; aun así, rotar keys es obligatorio.

## OCR

- `OCR_INTERNAL_SECRET` protege el endpoint entre Next y Cloud Run / Docker.
- No expongas el servicio OCR sin autenticación en producción si usas secret.
