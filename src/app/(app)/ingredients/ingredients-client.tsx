"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import type { Ingredient } from "@/types/ingredient";
import { INGREDIENT_UNITS } from "@/types/ingredient-unit";
import {
  createIngredient,
  updateIngredient,
  deleteIngredient,
} from "./actions";
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
import { Pencil, Plus, Trash2 } from "lucide-react";
import { unitLabel } from "@/lib/format";

const unitOptions = INGREDIENT_UNITS.map((u) => ({
  value: u,
  label: unitLabel(u),
}));

export function IngredientsClient({ initial }: { initial: Ingredient[] }) {
  const router = useRouter();
  const [isPendingDelete, startDelete] = useTransition();
  const [createPending, startCreate] = useTransition();
  const [updatePending, startUpdate] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const createFormRef = useRef<HTMLFormElement>(null);

  const handleDelete = useCallback(
    (id: string) => {
      startDelete(async () => {
        const fd = new FormData();
        fd.set("id", id);
        const res = await deleteIngredient(fd);
        if (res && "error" in res && res.error) toast.error(res.error);
        else {
          toast.success("Eliminado");
          router.refresh();
        }
      });
    },
    [router]
  );

  const columns = useMemo<ColumnDef<Ingredient>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Nombre",
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: "unit",
        header: "Unidad",
        cell: ({ row }) => unitLabel(row.original.unit),
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
      const res = await createIngredient({}, fd);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Ingrediente creado");
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
      const res = await updateIngredient({}, fd);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Ingrediente actualizado");
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
          Nuevo
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
                  No hay ingredientes.
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
          <p className="text-muted-foreground py-8 text-center text-sm">No hay ingredientes.</p>
        ) : (
          initial.map((row) => (
            <Card key={row.id}>
              <CardContent className="flex flex-col gap-3 p-4">
                <div>
                  <p className="font-medium">{row.name}</p>
                  <p className="text-muted-foreground text-sm">Unidad: {unitLabel(row.unit)}</p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="min-h-12 flex-1 text-base" onClick={() => setEditing(row)}>
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className="min-h-12 flex-1 text-base"
                    disabled={isPendingDelete}
                    onClick={() => handleDelete(row.id)}
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
            <DialogTitle>Nuevo ingrediente</DialogTitle>
          </DialogHeader>
          <form ref={createFormRef} onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="ci-name">Nombre</Label>
              <Input id="ci-name" name="name" required className="min-h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ci-unit">Unidad</Label>
              <select
                id="ci-unit"
                name="unit"
                required
                className="border-input bg-background ring-offset-background focus-visible:ring-ring flex min-h-11 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2"
                defaultValue="kg"
              >
                {unitOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
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
            <DialogTitle>Editar ingrediente</DialogTitle>
          </DialogHeader>
          {editing ? (
            <form onSubmit={handleUpdate} className="flex flex-col gap-4">
              <input type="hidden" name="id" value={editing.id} />
              <div className="space-y-2">
                <Label htmlFor="ei-name">Nombre</Label>
                <Input id="ei-name" name="name" required className="min-h-11" defaultValue={editing.name} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ei-unit">Unidad</Label>
                <select
                  id="ei-unit"
                  name="unit"
                  required
                  className="border-input bg-background ring-offset-background focus-visible:ring-ring flex min-h-11 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2"
                  defaultValue={editing.unit}
                >
                  {unitOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
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
