import { ChevronDown } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { cn } from "./cn";

/** Botón que despliega un panel (filtros). Se cierra con Esc o clic afuera. */
export function Dropdown({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"
      >
        {label}
        <ChevronDown size={14} aria-hidden className={cn("transition", open && "rotate-180")} />
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute top-full left-0 z-20 mt-1.5 flex w-64 flex-col gap-0.5 rounded-xl border border-line bg-white p-2 shadow-lg"
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
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
      <input type="checkbox" checked={checked} onChange={onChange} className="size-4 accent-brand" />
      {color && <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className="text-xs text-muted">{count}</span>}
    </label>
  );
}
