import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover",
  secondary: "border border-line bg-white text-ink hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
};
const SIZES: Record<Size, string> = {
  md: "min-h-[38px] px-4 text-sm",
  // En el celular, al menos 40px de alto para el dedo.
  sm: "min-h-10 px-2.5 text-xs sm:min-h-8",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = "primary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        // En el celular un texto largo pasa a dos líneas en vez de salirse; desde sm, siempre en una.
        "inline-flex max-w-full items-center justify-center gap-2 rounded-[10px] py-1 text-center leading-tight font-semibold whitespace-normal transition outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-60 sm:whitespace-nowrap [&>svg]:shrink-0",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
