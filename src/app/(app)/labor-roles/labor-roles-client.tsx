"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import type { LaborRole } from "@/types/recipe";
import { createLaborRole, updateLaborRole, deleteLaborRole } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import { formatMoneyEUR } from "@/lib/format";
import { Pencil, Plus, Trash2 } from "lucide-react";

export function LaborRolesClient({ initial }: { initial: LaborRole[] }) {
  const router = useRouter();
  const [isPendingDelete, startDelete] = useTransition();
  const [createPending, startCreate] = useTransition();
  const [updatePending, startUpdate] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LaborRole | null>(null);
  const createFormRef = useRef<HTMLFormElement>(null);

  const handleDelete = useCallback(
    (id: string) => {
      startDelete(async () => {
        const fd = new FormData();
        fd.set("id", id);
        const res = await deleteLaborRole(fd);
        if (res && "error" in res && res.error) toast.error(res.error);
        else {
          toast.success("Rol eliminado");
          router.refresh();
        }
      });
    },
    [router]
  );

  const columns = useMemo<ColumnDef<LaborRole>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Nombre",
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: "hourly_cost",
        header: "€ / hora",
        cell: ({ row }) => (
          <span className="tabular-nums">{formatMoneyEUR(row.original.hourly_cost)}</span>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Acciones</span>,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="min-h-9 min-w-9"
              aria-label="Editar"
              onClick={() => setEditing(row.original)}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive min-h-9 min-w-9"
              aria-label="Eliminar"
              disabled={isPendingDelete}
              onClick={() => handleDelete(row.original.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ),
      },
    ],
    [handleDelete, isPendingDelete]
  );

  const table = useReactTable({
    data: initial,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startCreate(async () => {
      const res = await createLaborRole({}, fd);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Rol creado");
        createFormRef.current?.reset();
        setOpen(false);
        router.refresh();
      }
    });
  }

  function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startUpdate(async () => {
      const res = await updateLaborRole({}, fd);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Rol actualizado");
        setEditing(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex justify-end">
        <Button type="button" className="min-h-12 shrink-0 gap-2 text-base" onClick={() => setOpen(true)}>
          <Plus className="size-5" />
          Nuevo rol
        </Button>
      </div>

      <ScrollArea className="hidden w-full rounded-lg border md:block">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className={h.column.id === "actions" ? "text-right" : undefined}>
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-muted-foreground py-8 text-center">
                  No hay roles. Crea uno (ej. cocinero 18 €/h).
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <div className="flex flex-col gap-3 md:hidden">
        {initial.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">No hay roles.</p>
        ) : (
          initial.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-col gap-3 p-4">
                <div>
                  <p className="font-medium">{r.name}</p>
                  <p className="text-muted-foreground mt-1 text-sm tabular-nums">
                    {formatMoneyEUR(r.hourly_cost)} / h
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="min-h-12 flex-1 text-base" onClick={() => setEditing(r)}>
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className="min-h-12 flex-1 text-base"
                    disabled={isPendingDelete}
                    onClick={() => handleDelete(r.id)}
                  >
                    Eliminar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo rol</DialogTitle>
          </DialogHeader>
          <form ref={createFormRef} onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="lr-c-name">Nombre</Label>
              <Input id="lr-c-name" name="name" required className="min-h-11" placeholder="Cocinero" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lr-c-cost">Coste horario (€)</Label>
              <Input
                id="lr-c-cost"
                name="hourly_cost"
                type="number"
                min={0}
                step="0.01"
                required
                className="min-h-11"
                defaultValue={18}
              />
            </div>
            <Button type="submit" className="min-h-11 w-full" disabled={createPending}>
              {createPending ? "Guardando…" : "Guardar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar rol</DialogTitle>
          </DialogHeader>
          {editing ? (
            <form onSubmit={handleUpdate} className="flex flex-col gap-4">
              <input type="hidden" name="id" value={editing.id} />
              <div className="space-y-2">
                <Label htmlFor="lr-e-name">Nombre</Label>
                <Input id="lr-e-name" name="name" required className="min-h-11" defaultValue={editing.name} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lr-e-cost">Coste horario (€)</Label>
                <Input
                  id="lr-e-cost"
                  name="hourly_cost"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  className="min-h-11"
                  defaultValue={editing.hourly_cost}
                />
              </div>
              <Button type="submit" className="min-h-11 w-full" disabled={updatePending}>
                {updatePending ? "Guardando…" : "Actualizar"}
              </Button>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
