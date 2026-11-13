import { cn } from "./cn";

export interface TabItem<K extends string> {
  key: K;
  label: string;
  badge?: number | undefined;
}

/** Pestañas accesibles (role=tablist) controladas desde afuera. */
export function Tabs<K extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line">
      {items.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={t.key === value}
          onClick={() => onChange(t.key)}
          className={cn(
            "-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition",
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
