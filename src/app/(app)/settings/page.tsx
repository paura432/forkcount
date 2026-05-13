import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8">
      <SettingsClient email={user?.email ?? null} />

      <section className="rounded-lg border bg-muted/30 p-4 text-sm">
        <h2 className="font-medium">Lectura automática de facturas (OCR)</h2>
        <p className="text-muted-foreground mt-2">
          Próximamente: extracción de líneas desde foto o PDF. El esquema de datos ya reserva
          columnas para esta fase.
        </p>
      </section>

      <p className="text-muted-foreground text-center text-xs">
        <Link href="/dashboard" className="text-primary underline underline-offset-4">
          Volver al panel
        </Link>
      </p>
    </div>
  );
}
