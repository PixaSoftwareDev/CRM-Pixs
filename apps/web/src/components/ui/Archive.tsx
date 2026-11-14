/**
 * Baja lógica (proyectos, tickets): ocultar sin borrar. El botón pide
 * confirmación en un modal; si ya está de baja, un aviso con "Reactivar".
 */
import { Archive, ArchiveArrowUp } from "lucide-react";
import { useState } from "react";
import { when } from "../../lib/format";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

/** Botón "Dar de baja" con confirmación. `what`: "el proyecto", "el ticket #121"… */
export function ArchiveButton({
  what,
  consequences,
  pending,
  onConfirm,
}: {
  what: string;
  /** Qué deja de verse (se aclara que no se borra nada). */
  consequences: string;
  pending: boolean;
  onConfirm: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Archive size={13} aria-hidden /> Dar de baja
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`¿Dar de baja ${what}?`}>
        <div className="flex flex-col gap-3 text-sm">
          <p>{consequences}</p>
          <p className="text-muted">No se borra nada: se puede ver desde "Ver dados de baja" y reactivar cuando quieras.</p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => void onConfirm().then(() => setOpen(false), () => undefined)}
            >
              Dar de baja
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/** Aviso de que está de baja, con el botón para reactivarlo. */
export function ArchivedBanner({
  label,
  archivedAt,
  pending,
  onRestore,
}: {
  /** "Este proyecto está dado de baja"… */
  label: string;
  archivedAt: string;
  pending: boolean;
  onRestore: () => void;
}) {
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <span className="flex items-center gap-2">
        <Archive size={16} aria-hidden className="shrink-0" />
        <span>
          <strong>{label}</strong> desde {when(archivedAt, false)}. No aparece en los listados.
        </span>
      </span>
      <Button size="sm" variant="secondary" disabled={pending} onClick={onRestore}>
        <ArchiveArrowUp size={13} aria-hidden /> Reactivar
      </Button>
    </div>
  );
}
