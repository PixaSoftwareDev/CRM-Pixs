"use client"

import { useActionState } from "react"
import { LogoMark } from "@/components/Logo"
import { ThemeToggle } from "@/components/ThemeToggle"
import { DEMO_EMAIL } from "@/lib/auth/constants"
import { demoLogin, type LoginState, login } from "@/modules/auth/actions"

const initialState: LoginState = {}

// El acceso rápido se muestra en desarrollo o cuando se habilita explícitamente
// en el server (NEXT_PUBLIC_SHOW_DEMO=1), p. ej. en la instancia de pruebas.
const SHOW_DEMO = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_SHOW_DEMO === "1"

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState)

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-gradient-to-b from-white to-zinc-100 p-4 dark:from-zinc-950 dark:to-black">
      {/* Toggle de tema */}
      <ThemeToggle className="absolute right-4 top-4 z-20" />

      {/* Gradientes suaves de marca detrás de la tarjeta */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-blue-400/25 blur-[120px] dark:bg-blue-600/20"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -right-24 h-[28rem] w-[28rem] rounded-full bg-violet-400/25 blur-[120px] dark:bg-violet-700/20"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/10 blur-[100px] dark:bg-cyan-500/10"
      />

      <div className="relative z-10 w-full max-w-sm animate-slide-up rounded-2xl border border-white/70 bg-white/75 p-8 shadow-xl shadow-blue-500/5 backdrop-blur-xl dark:border-white/[.08] dark:bg-zinc-950/70 dark:shadow-black/40">
        <div className="flex flex-col items-center gap-3 pb-1 text-center">
          <LogoMark className="h-32 w-auto drop-shadow-[0_10px_28px_rgba(59,130,246,0.28)]" />
          <p className="text-sm text-zinc-500">Iniciá sesión para continuar</p>
        </div>

        <form action={formAction} className="mt-5 space-y-5">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Email</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-lg border border-zinc-300 bg-white/60 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-white/[.03] dark:focus:border-blue-400"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Contraseña</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-zinc-300 bg-white/60 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-white/[.03] dark:focus:border-blue-400"
            />
          </label>

          {state.error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-600/20 transition-all hover:from-blue-500 hover:to-violet-500 hover:shadow-blue-600/30 disabled:opacity-60"
          >
            {pending ? "Ingresando…" : "Ingresar"}
          </button>
        </form>

        {SHOW_DEMO ? (
          <form
            action={demoLogin}
            className="mt-4 space-y-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]"
          >
            <button
              type="submit"
              className="w-full rounded-lg border border-zinc-300 bg-transparent px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-white/[.06]"
            >
              Acceso rápido (demo)
            </button>
            <p className="text-center text-xs text-zinc-400">Entra como {DEMO_EMAIL}</p>
          </form>
        ) : null}
      </div>
    </div>
  )
}
