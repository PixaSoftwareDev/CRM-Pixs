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
  /** md: formularios; xl: vistas de detalle con columnas; full: ocupa toda la pantalla, siempre del mismo tamaño. */
  size?: "md" | "xl" | "full";
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
      // Con un modal encima de otro, React le hace llegar al de abajo los eventos del
      // de arriba: cada uno atiende solo los propios.
      onClose={(e) => e.target === ref.current && onClose()}
      // Esc no cierra solo: avisa al dueño, que decide (p. ej. si hay cambios sin guardar).
      onCancel={(e) => {
        if (e.target !== ref.current) return;
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn(
        "m-auto w-[calc(100%-32px)] rounded-[14px] border border-line p-0 shadow-2xl backdrop:bg-slate-900/45",
        size === "full"
          ? "h-[calc(100dvh-32px)] max-h-none max-w-none"
          : size === "xl"
            ? "max-w-5xl"
            : "max-w-lg",
        className,
      )}
    >
      {open && (
        <div className={cn("flex flex-col", size === "full" && "h-full")}>
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
          <div className={cn("p-5", size === "full" && "min-h-0 flex-1 overflow-y-auto")}>{children}</div>
        </div>
      )}
    </dialog>
  );
}
