"use client"

import { useActionState } from "react"
import { type LoginState, login } from "@/modules/auth/actions"

const initialState: LoginState = {}

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState)

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      <form
        action={formAction}
        className="w-full max-w-sm space-y-5 rounded-xl border border-black/[.08] bg-white p-8 shadow-sm dark:border-white/[.12] dark:bg-zinc-950"
      >
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Pixs CRM</h1>
          <p className="text-sm text-zinc-500">Iniciá sesión para continuar</p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Contraseña</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
          />
        </label>

        {state.error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pending ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </div>
  )
}
