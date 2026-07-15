"use client"

import { createContext, useCallback, useContext, useRef, useState } from "react"
import { Modal } from "./Modal"
import { Button } from "./ui"

type ConfirmOptions = {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

/** Hook para pedir confirmación con un cartel propio. `const confirm = useConfirm()`. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error("useConfirm debe usarse dentro de <ConfirmProvider>")
  return ctx
}

/**
 * Reemplaza a window.confirm en toda la app con un modal consistente. Envuelve
 * el árbol una sola vez (en el layout) y expone `useConfirm()`, que devuelve una
 * promesa que resuelve true/false según el botón elegido.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((options) => {
    setOpts(options)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const close = useCallback((result: boolean) => {
    resolver.current?.(result)
    resolver.current = null
    setOpts(null)
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts ? (
        <Modal title={opts.title ?? "Confirmar"} onClose={() => close(false)} className="max-w-sm">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{opts.message}</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => close(false)}>
              {opts.cancelLabel ?? "Cancelar"}
            </Button>
            <Button variant={opts.danger ? "danger" : "primary"} onClick={() => close(true)}>
              {opts.confirmLabel ?? "Eliminar"}
            </Button>
          </div>
        </Modal>
      ) : null}
    </ConfirmContext.Provider>
  )
}
