import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMoneyEUR, unitLabel } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import type { PurchaseDocumentType, PurchaseStatus } from "@/lib/types";
import { parseInvoiceOcrDraft } from "@/lib/ocr-extraction";
import { OcrReviewForm } from "../ocr-review-form";
import { PurchaseLinesReview, type PurchaseLineReview } from "../purchase-lines-review";
import { PurchaseItemAssociateDialog } from "../purchase-item-associate-dialog";
import { PurchaseLineStatusBadges } from "../purchase-line-status-badges";
import { lineNeedsOcrReview, ocrNeedsReviewByNormalizedName } from "@/lib/ocr-line-review";
import type { Ingredient } from "@/types/ingredient";

type IngredientRel = { name: string; unit: string } | { name: string; unit: string }[] | null;

type LineRow = {
  id: string;
  raw_name: string;
  quantity: number;
  quantity_unit: string;
  total_price: number;
  unit_price: number;
  normalized_quantity: number;
  normalized_unit: string;
  normalized_unit_price: number;
  ingredient_id: string | null;
  ingredients: IngredientRel;
};

type PurchaseDetail = {
  id: string;
  purchase_date: string;
  document_type: PurchaseDocumentType;
  document_number: string | null;
  status: PurchaseStatus;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  extraction_source: string;
  notes: string | null;
  invoice_path: string | null;
  invoice_original_name: string | null;
  invoice_ocr_raw: unknown | null;
  invoice_ocr_status: string;
  invoice_ocr_error: string | null;
  suppliers: { name: string } | { name: string }[] | null;
  purchase_items: LineRow[] | null;
};

const DOC_LABEL: Record<PurchaseDocumentType, string> = {
  invoice: "Factura",
  delivery_note: "Albarán",
  receipt: "Ticket / recibo",
  order: "Pedido",
};

const STATUS_LABEL: Record<PurchaseStatus, string> = {
  draft: "Borrador",
  pending_review: "Pendiente de revisión",
  confirmed: "Confirmada",
};

function firstRel<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: row, error }, ingRes] = await Promise.all([
    supabase
      .from("purchases")
      .select(
        `
      id,
      purchase_date,
      document_type,
      document_number,
      status,
      subtotal,
      tax_amount,
      total_amount,
      extraction_source,
      notes,
      invoice_path,
      invoice_original_name,
      invoice_ocr_raw,
      invoice_ocr_status,
      invoice_ocr_error,
      suppliers (name),
      purchase_items (
        id,
        raw_name,
        quantity,
        quantity_unit,
        total_price,
        unit_price,
        normalized_quantity,
        normalized_unit,
        normalized_unit_price,
        ingredient_id,
        ingredients (name, unit)
      )
    `
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("ingredients").select("*").order("name"),
  ]);

  if (error) {
    return <p className="text-destructive text-sm">Error: {error.message}</p>;
  }
  if (!row) notFound();

  const p = row as PurchaseDetail;
  const lines = p.purchase_items ?? [];
  const totalSum = lines.reduce((s, l) => s + Number(l.total_price), 0);

  const ingredients = (ingRes.data ?? []) as Ingredient[];
  const isOcrSource = p.extraction_source === "ocr" || p.extraction_source === "ocr_image";
  const ocrDraft = isOcrSource ? parseInvoiceOcrDraft(p.invoice_ocr_raw) : null;
  const showOcrReview =
    isOcrSource && p.invoice_ocr_status === "done" && ocrDraft != null && lines.length === 0;

  const supplier = firstRel(p.suppliers);
  const needsReviewByName = ocrNeedsReviewByNormalizedName(p.invoice_ocr_raw);
  const pendingCount = lines.filter((l) => !l.ingredient_id).length;

  let invoiceUrl: string | null = null;
  if (p.invoice_path) {
    const { data: signed } = await supabase.storage
      .from("invoices")
      .createSignedUrl(p.invoice_path, 3600);
    invoiceUrl = signed?.signedUrl ?? null;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link
          href="/purchases"
          className={buttonVariants({ variant: "ghost", className: "h-auto w-fit px-0 text-sm" })}
        >
          ← Compras
        </Link>
        <p className="text-muted-foreground mt-1 text-sm">
          {p.purchase_date} · {supplier?.name ?? "—"} · {DOC_LABEL[p.document_type]}
          {p.document_number ? ` · n.º ${p.document_number}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge variant={p.status === "confirmed" ? "secondary" : "outline"}>
            {STATUS_LABEL[p.status]}
          </Badge>
          <Badge variant="outline" className="text-xs font-normal">
            Origen:{" "}
            {p.extraction_source === "ocr_image"
              ? "Foto OCR"
              : p.extraction_source === "ocr"
                ? "OCR"
                : "Manual"}
          </Badge>
        </div>
        {pendingCount > 0 ? (
          <Link
            href={`/purchases/${p.id}/mapping`}
            className={buttonVariants({ variant: "outline", size: "sm", className: "text-xs" })}
          >
            {pendingCount} producto{pendingCount === 1 ? "" : "s"} pendiente
            {pendingCount === 1 ? "" : "s"} de asociar
          </Link>
        ) : null}
      </div>

      {(p.subtotal != null || p.tax_amount != null || p.total_amount != null) && (
        <div className="rounded-lg border p-4 text-sm tabular-nums">
          {p.subtotal != null ? (
            <p>
              <span className="text-muted-foreground">Subtotal:</span> {formatMoneyEUR(Number(p.subtotal))}
            </p>
          ) : null}
          {p.tax_amount != null ? (
            <p>
              <span className="text-muted-foreground">IVA / impuestos:</span>{" "}
              {formatMoneyEUR(Number(p.tax_amount))}
            </p>
          ) : null}
          {p.total_amount != null ? (
            <p className="font-medium">
              <span className="text-muted-foreground font-normal">Total documento:</span>{" "}
              {formatMoneyEUR(Number(p.total_amount))}
            </p>
          ) : null}
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-lg border p-4">
        <p className="text-sm font-medium">Documento adjunto</p>
        {invoiceUrl ? (
          <a
            href={invoiceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", className: "min-h-12 w-full sm:w-auto" })}
          >
            Abrir {p.invoice_original_name ?? "archivo"}
          </a>
        ) : (
          <p className="text-muted-foreground text-sm">Sin archivo adjunto.</p>
        )}
      </div>

      {p.notes ? (
        <p className="text-muted-foreground text-sm">
          <span className="text-foreground font-medium">Notas: </span>
          {p.notes}
        </p>
      ) : null}

      {p.invoice_ocr_status === "error" && p.invoice_ocr_error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Error en extracción OCR</p>
          <p className="text-muted-foreground mt-1 whitespace-pre-wrap">{p.invoice_ocr_error}</p>
        </div>
      ) : null}

      {p.invoice_ocr_status === "processing" ? (
        <p className="text-muted-foreground text-sm">Extracción OCR en curso… recarga la página en unos segundos.</p>
      ) : null}

      {showOcrReview && ocrDraft ? (
        <OcrReviewForm purchaseId={p.id} draft={ocrDraft} ingredients={ingredients} />
      ) : null}

      {lines.length > 0 ? (
        <PurchaseLinesReview
          lines={lines.map((l): PurchaseLineReview => {
            const ing = firstRel(l.ingredients);
            return {
              id: l.id,
              raw_name: l.raw_name,
              quantity: Number(l.quantity),
              quantity_unit: l.quantity_unit,
              unit_price: Number(l.unit_price),
              total_price: Number(l.total_price),
              ingredient_id: l.ingredient_id,
              ingredient_name: ing?.name ?? null,
              needs_ocr_review: lineNeedsOcrReview(l.raw_name, needsReviewByName),
            };
          })}
          ingredients={ingredients}
        />
      ) : null}

      <div>
        <h2 className="text-lg font-semibold">Líneas</h2>
        <p className="text-muted-foreground mt-1 text-sm tabular-nums">
          Suma líneas: {formatMoneyEUR(totalSum)}
        </p>

        <div className="mt-3 hidden rounded-lg border md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto (documento)</TableHead>
                <TableHead>Catálogo</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">P. unit.</TableHead>
                <TableHead className="text-right text-xs font-normal">Normalizado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground py-6 text-center text-sm">
                    Sin líneas.
                  </TableCell>
                </TableRow>
              ) : (
                lines.map((l) => {
                  const ing = firstRel(l.ingredients);
                  const needsOcr = lineNeedsOcrReview(l.raw_name, needsReviewByName);
                  const lineProps = {
                    purchaseItemId: l.id,
                    rawName: l.raw_name,
                    quantity: Number(l.quantity),
                    quantityUnit: l.quantity_unit,
                    unitPrice: Number(l.unit_price),
                    totalPrice: Number(l.total_price),
                    ingredients,
                  };
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">
                        <span className="flex flex-col gap-1">
                          <span>{l.raw_name}</span>
                          <PurchaseLineStatusBadges
                            hasIngredient={Boolean(ing)}
                            needsOcrReview={needsOcr}
                          />
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {ing?.name ? (
                          <span className="text-muted-foreground">{ing.name}</span>
                        ) : (
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-amber-950 dark:text-amber-100">Producto sin asociar</span>
                            <PurchaseItemAssociateDialog {...lineProps} triggerLabel="Asociar" />
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(l.quantity)} {unitLabel(l.quantity_unit)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoneyEUR(Number(l.total_price))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {formatMoneyEUR(Number(l.unit_price))} / {unitLabel(l.quantity_unit)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                        {Number(l.normalized_quantity)} {l.normalized_unit} @{" "}
                        {formatMoneyEUR(Number(l.normalized_unit_price))}/{l.normalized_unit}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-3 flex flex-col gap-2 md:hidden">
          {lines.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">Sin líneas.</p>
          ) : (
            lines.map((l) => {
              const ing = firstRel(l.ingredients);
              const needsOcr = lineNeedsOcrReview(l.raw_name, needsReviewByName);
              const lineProps = {
                purchaseItemId: l.id,
                rawName: l.raw_name,
                quantity: Number(l.quantity),
                quantityUnit: l.quantity_unit,
                unitPrice: Number(l.unit_price),
                totalPrice: Number(l.total_price),
                ingredients,
              };
              return (
                <Card key={l.id}>
                  <CardContent className="flex flex-col gap-1 p-4 text-sm">
                    <p className="font-medium">{l.raw_name}</p>
                    <PurchaseLineStatusBadges
                      hasIngredient={Boolean(ing)}
                      needsOcrReview={needsOcr}
                    />
                    <p className="text-muted-foreground text-xs">
                      Catálogo:{" "}
                      {ing?.name ? (
                        <>
                          {ing.name}
                          {ing.unit ? ` (${unitLabel(ing.unit)})` : ""}
                        </>
                      ) : (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <span className="text-amber-950 dark:text-amber-100">Producto sin asociar</span>
                          <PurchaseItemAssociateDialog {...lineProps} triggerLabel="Asociar" />
                        </span>
                      )}
                    </p>
                    <p className="text-muted-foreground">
                      {Number(l.quantity)} {unitLabel(l.quantity_unit)}
                    </p>
                    <p>Total línea: {formatMoneyEUR(Number(l.total_price))}</p>
                    <p className="tabular-nums">
                      Unit.: {formatMoneyEUR(Number(l.unit_price))} / {unitLabel(l.quantity_unit)}
                    </p>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {Number(l.normalized_quantity)} {l.normalized_unit} ·{" "}
                      {formatMoneyEUR(Number(l.normalized_unit_price))}/{l.normalized_unit}
                    </p>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
