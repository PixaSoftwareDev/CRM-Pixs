import type { ReactNode } from "react";
import { cn } from "./cn";

export type Tone = "slate" | "indigo" | "green" | "amber" | "red" | "blue" | "purple";

const TONES: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700",
  indigo: "bg-indigo-50 text-indigo-800",
  green: "bg-green-100 text-green-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  blue: "bg-blue-100 text-blue-800",
  purple: "bg-purple-100 text-purple-800",
};

export function Chip({ tone = "slate", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  // Un texto largo se corta con "…" (y se ve entero al pasar el mouse) en vez de salirse del contenedor.
  const text = typeof children === "string" || typeof children === "number" ? String(children) : undefined;
  return (
    <span
      title={text}
      className={cn(
        "inline-flex h-[22px] max-w-full items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {text !== undefined ? <span className="min-w-0 truncate">{text}</span> : children}
    </span>
  );
}
