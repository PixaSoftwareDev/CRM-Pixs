import type { KeyboardEvent } from "react";
import { cn } from "./cn";

export interface TabItem<K extends string> {
  key: K;
  label: string;
  badge?: number | undefined;
}

/**
 * Props del panel de una pestaña (role=tabpanel), para usar junto con `<Tabs id>`:
 * `<div {...tabPanelProps("cliente", current)}>…</div>`.
 */
export function tabPanelProps(id: string, key: string) {
  return { role: "tabpanel", id: `${id}-panel-${key}`, "aria-labelledby": `${id}-tab-${key}`, tabIndex: 0 } as const;
}

/**
 * Pestañas accesibles (role=tablist) controladas desde afuera. Teclado como
 * pide WAI-ARIA: Tab entra a la pestaña activa y las flechas (Inicio/Fin)
 * pasan de una a otra, activándola. Con `id`, cada pestaña apunta a su panel
 * (ver `tabPanelProps`).
 */
export function Tabs<K extends string>({
  items,
  value,
  onChange,
  label,
  id,
}: {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
  /** Base de los ids de pestañas y paneles; sin él no se conectan con un tabpanel. */
  id?: string;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex((t) => t.key === value);
    const next =
      e.key === "ArrowRight"
        ? (i + 1) % items.length
        : e.key === "ArrowLeft"
          ? (i - 1 + items.length) % items.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? items.length - 1
              : null;
    if (next === null) return;
    const target = items[next];
    if (!target) return;
    e.preventDefault();
    onChange(target.key);
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line"
    >
      {items.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          id={id && `${id}-tab-${t.key}`}
          aria-controls={id && t.key === value ? `${id}-panel-${t.key}` : undefined}
          aria-selected={t.key === value}
          // Sin pestaña activa en la lista (no debería pasar) la primera queda alcanzable con Tab.
          tabIndex={t.key === value || (!items.some((x) => x.key === value) && t === items[0]) ? 0 : -1}
          onClick={() => onChange(t.key)}
          className={cn(
            // El contorno de foco va hacia adentro: el scroll horizontal de la lista lo recortaría.
            "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
            t.key === value
              ? "border-brand font-semibold text-ink"
              : "border-transparent text-muted hover:text-ink",
          )}
        >
          {t.label}
          {t.badge !== undefined && t.badge > 0 && (
            <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-600">{t.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}
