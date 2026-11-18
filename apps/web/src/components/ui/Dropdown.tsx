import { ChevronDown } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "./cn";

const PANEL_WIDTH = 256;
const GUTTER = 16;

/**
 * Posición fija del panel respecto del botón (como ClientCombobox): al ser
 * `fixed` no lo recorta un contenedor con scroll ni un <dialog>, y no se sale
 * de la pantalla en el celular. Se abre hacia arriba si abajo no hay lugar.
 */
function panelPosition(button: HTMLElement): CSSProperties {
  const r = button.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(PANEL_WIDTH, vw - GUTTER * 2);
  const left = Math.min(Math.max(r.left, GUTTER), vw - GUTTER - width);
  const below = vh - r.bottom - GUTTER;
  const above = r.top - GUTTER;
  const up = below < 200 && above > below;
  const maxHeight = Math.min(420, (up ? above : below) - 6);
  return up ? { left, width, maxHeight, bottom: vh - r.top + 6 } : { left, width, maxHeight, top: r.bottom + 6 };
}

/** Botón que despliega un panel (filtros). Se cierra con Esc, clic afuera o al salir con Tab. */
export function Dropdown({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Acompaña al botón si se scrollea la página (o un contenedor) o cambia el tamaño de la ventana.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => button.current && setStyle(panelPosition(button.current));
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      // El foco vuelve al botón (si estaba adentro del panel, no queda perdido).
      if (ref.current?.contains(document.activeElement)) button.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className={cn("relative", className)}
      onBlur={(e) => {
        if (open && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-[10px] border border-line bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"
      >
        {label}
        <ChevronDown size={14} aria-hidden className={cn("shrink-0 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div
          id={panelId}
          style={style}
          className="fixed z-30 flex flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-xl border border-line bg-white p-2 shadow-lg"
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Opción con checkbox para el panel de un Dropdown. */
export function CheckOption({
  checked,
  onChange,
  color,
  label,
  count,
}: {
  checked: boolean;
  onChange: () => void;
  color?: string;
  label: string;
  count?: number;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50" title={label}>
      <input type="checkbox" checked={checked} onChange={onChange} className="size-4 shrink-0 accent-brand" />
      {color && <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className="shrink-0 text-xs text-muted">{count}</span>}
    </label>
  );
}
