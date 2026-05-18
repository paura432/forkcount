import { Badge } from "@/components/ui/badge";

export function PurchaseLineStatusBadges({
  hasIngredient,
  needsOcrReview,
}: {
  hasIngredient: boolean;
  needsOcrReview?: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {hasIngredient ? (
        <Badge variant="secondary" className="text-xs font-normal">
          Asociado
        </Badge>
      ) : (
        <Badge variant="outline" className="border-amber-500/50 text-xs font-normal text-amber-950 dark:text-amber-100">
          Pendiente
        </Badge>
      )}
      {needsOcrReview ? (
        <Badge variant="outline" className="text-xs font-normal">
          Revisar OCR
        </Badge>
      ) : null}
    </span>
  );
}
