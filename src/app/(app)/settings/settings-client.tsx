"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SettingsClient({ email }: { email: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function logout() {
    start(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast.error(error.message);
        return;
      }
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Sesión</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {email ? (
          <p className="text-muted-foreground text-sm break-all">
            Conectado como <span className="text-foreground font-medium">{email}</span>
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">No hay sesión.</p>
        )}
        <Button
          type="button"
          variant="destructive"
          className="min-h-12 w-full text-base"
          disabled={pending}
          onClick={() => logout()}
        >
          {pending ? "Cerrando…" : "Cerrar sesión"}
        </Button>
      </CardContent>
    </Card>
  );
}
