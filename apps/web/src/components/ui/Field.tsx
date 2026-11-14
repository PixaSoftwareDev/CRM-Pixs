import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { cn } from "./cn";

const control =
  "h-[38px] w-full rounded-[10px] border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 aria-invalid:border-red-500";

/** Flecha propia y texto con "…" si no entra: todos los desplegables se ven igual. */
export const selectArrow =
  "appearance-none truncate bg-[image:var(--select-chevron)] bg-[length:14px] bg-[position:right_0.7rem_center] bg-no-repeat";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(control, className)} {...props} />,
);
Input.displayName = "Input";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => <select ref={ref} className={cn(control, selectArrow, "pr-9", className)} {...props} />,
);
Select.displayName = "Select";

/** Etiqueta + control + error, accesible (el label envuelve el control). */
export function Field({
  label,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1 text-xs font-medium text-muted", className)}>
      {label}
      {children}
      {error ? (
        <span className="text-xs font-normal text-red-600">{error}</span>
      ) : hint ? (
        <span className="text-xs font-normal text-slate-400">{hint}</span>
      ) : null}
    </label>
  );
}
