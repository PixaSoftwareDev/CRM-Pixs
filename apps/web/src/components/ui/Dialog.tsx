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
    if (open && !el.open) {
      el.showModal();
      // React hace autoFocus al montar, cuando el <dialog> todavía está cerrado (y no
      // se puede enfocar); al abrirlo el navegador manda el foco a la X. Lo corregimos.
      el.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
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
        // En el celular, cualquier modal es una hoja a pantalla completa: título y X fijos
        // arriba, el contenido scrollea adentro (un solo scroll) y las acciones quedan abajo.
        "max-sm:m-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:rounded-none max-sm:border-0",
        className,
      )}
    >
      {open && (
        <div className={cn("flex flex-col max-sm:h-full", size === "full" && "h-full")}>
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-4 py-3 sm:px-5 sm:py-4">
            <div className="min-w-0 break-words">
              <h2 className="text-lg font-bold">{title}</h2>
              {description && <p className="mt-0.5 text-xs [overflow-wrap:anywhere] text-muted">{description}</p>}
            </div>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              className="-mr-1.5 flex size-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 sm:mr-0 sm:size-8"
            >
              <X size={16} aria-hidden />
            </button>
          </header>
          <div className={cn("p-4 max-sm:min-h-0 max-sm:flex-1 max-sm:overflow-y-auto max-sm:overscroll-contain sm:p-5", size === "full" && "min-h-0 flex-1 overflow-y-auto")}>
            {children}
          </div>
        </div>
      )}
    </dialog>
  );
}

/**
 * Botonera de un modal. En el celular queda pegada abajo de la hoja (siempre a mano
 * aunque el formulario sea largo); en pantallas grandes es una fila más, como siempre.
 */
export function DialogActions({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "max-sm:sticky max-sm:-bottom-4 max-sm:z-10 max-sm:-mx-4 max-sm:-mb-4 max-sm:border-t max-sm:border-line max-sm:bg-white max-sm:px-4 max-sm:pt-3 max-sm:pb-[max(12px,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      {children}
    </div>
  );
}
