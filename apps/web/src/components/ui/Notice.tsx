import { useCallback, useEffect, useState } from "react";

/** Aviso breve tras una acción ("Agendada…"). Se va solo a los 5 segundos. */
export function useNotice() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(t);
  }, [message]);
  return { message, show: useCallback((m: string) => setMessage(m), []) };
}

export function Notice({ message }: { message: string | null }) {
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      {message && (
        <p className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">{message}</p>
      )}
    </div>
  );
}
