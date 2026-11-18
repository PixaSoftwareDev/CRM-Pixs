import type { ReactNode } from "react";

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-muted">
      {children}
    </p>
  );
}

export function ErrorBox({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-800">
      <span className="min-w-0 break-words">{error.message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 font-semibold underline">
          Reintentar
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <span aria-hidden className={`block animate-pulse rounded bg-slate-200 ${className}`} />;
}
