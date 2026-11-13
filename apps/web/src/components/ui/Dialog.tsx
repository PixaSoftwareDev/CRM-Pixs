import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "./cn";

/**
 * Modal sobre <dialog> nativo: foco atrapado, Esc para cerrar y fondo inerte
 * los da el navegador (accesible sin librerías).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string | undefined;
  children: ReactNode;
  className?: string;
  /** md: formularios; xl: vistas de detalle con columnas. */
  size?: "md" | "xl";
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // Esc no cierra solo: avisa al dueño, que decide (p. ej. si hay cambios sin guardar).
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn(
        "m-auto w-[calc(100%-32px)] rounded-[14px] border border-line p-0 shadow-2xl backdrop:bg-slate-900/45",
        size === "xl" ? "max-w-5xl" : "max-w-lg",
        className,
      )}
    >
      {open && (
        <div className="flex flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-lg font-bold">{title}</h2>
              {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
            </div>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            >
              <X size={16} aria-hidden />
            </button>
          </header>
          <div className="p-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}
