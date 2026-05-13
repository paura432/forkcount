import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoneyEUR } from "@/lib/format";
import type { PurchaseDocumentType, PurchaseStatus } from "@/lib/types";

type SupplierRel = { name: string } | { name: string }[] | null;

type Row = {
  id: string;
  purchase_date: string;
  document_type: PurchaseDocumentType;
  document_number: string | null;
  status: PurchaseStatus;
  total_amount: number | string | null;
  invoice_path: string | null;
  invoice_original_name: string | null;
  notes: string | null;
  suppliers: SupplierRel;
};

const DOC_LABEL: Record<PurchaseDocumentType, string> = {
  invoice: "Factura",
  delivery_note: "Albarán",
  receipt: "Recibo",
  order: "Pedido",
};

const STATUS_LABEL: Record<PurchaseStatus, string> = {
  draft: "Borrador",
  pending_review: "Pendiente",
  confirmed: "Confirmada",
};

function supplierName(s: SupplierRel): string {
  if (s == null) return "—";
  return Array.isArray(s) ? (s[0]?.name ?? "—") : s.name;
}

export function PurchasesTable({ rows }: { rows: Row[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Historial</h2>
      <ScrollArea className="hidden w-full rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Adjunto</TableHead>
              <TableHead className="w-[100px] text-right"> </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-8 text-center">
                  Aún no hay compras.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{r.purchase_date}</TableCell>
                  <TableCell>{supplierName(r.suppliers)}</TableCell>
                  <TableCell>
                    <span className="text-sm">{DOC_LABEL[r.document_type]}</span>
                    {r.document_number ? (
                      <span className="text-muted-foreground ml-1 text-xs">· {r.document_number}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === "confirmed" ? "secondary" : "outline"}>
                      {STATUS_LABEL[r.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {r.total_amount != null && r.total_amount !== ""
                      ? formatMoneyEUR(Number(r.total_amount))
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {r.invoice_path ? (
                      <Badge variant="secondary">Sí</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {r.invoice_original_name ? (
                      <span className="text-muted-foreground ml-2 inline-block max-w-[120px] truncate align-middle text-xs">
                        {r.invoice_original_name}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/purchases/${r.id}`}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "min-h-9")}
                    >
                      Ver
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <div className="flex flex-col gap-2 md:hidden">
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">Sin compras.</p>
        ) : (
          rows.map((r) => (
            <Link key={r.id} href={`/purchases/${r.id}`} className="block">
              <Card className="transition-colors hover:bg-muted/40">
                <CardContent className="flex flex-col gap-1 p-4 text-sm">
                  <p className="font-medium">{r.purchase_date}</p>
                  <p className="text-muted-foreground">{supplierName(r.suppliers)}</p>
                  <p className="flex flex-wrap items-center gap-2">
                    <span>{DOC_LABEL[r.document_type]}</span>
                    <Badge variant={r.status === "confirmed" ? "secondary" : "outline"} className="text-xs">
                      {STATUS_LABEL[r.status]}
                    </Badge>
                  </p>
                  {r.document_number ? (
                    <p className="text-muted-foreground text-xs">N.º {r.document_number}</p>
                  ) : null}
                  <p className="tabular-nums font-medium">
                    {r.total_amount != null && r.total_amount !== ""
                      ? formatMoneyEUR(Number(r.total_amount))
                      : "—"}
                  </p>
                  <p>
                    {r.invoice_path ? (
                      <Badge variant="secondary">Adjunto</Badge>
                    ) : (
                      <span className="text-muted-foreground">Sin adjunto</span>
                    )}
                  </p>
                  {r.notes ? <p className="text-muted-foreground">{r.notes}</p> : null}
                  <span className={cn(buttonVariants({ variant: "link" }), "h-auto p-0 text-left")}>
                    Ver detalle →
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
