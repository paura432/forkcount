"use client";

/** Avisos `debug.warnings` del microservicio OCR — tono suave, no error bloqueante. */
export function OcrWarningsBanner({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div
      role="status"
      className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-50"
    >
      <p className="font-medium">Algunos datos requieren revisión.</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-900/90 dark:text-amber-100/90">
        {warnings.map((w, i) => (
          <li key={`${i}-${w}`}>{w}</li>
        ))}
      </ul>
    </div>
  );
}
