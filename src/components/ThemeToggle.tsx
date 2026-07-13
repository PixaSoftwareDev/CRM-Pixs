"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

/** Botón sol/luna que alterna el tema y lo persiste en localStorage. */
export function ThemeToggle({ className }: { className?: string }) {
  // undefined hasta montar, para no renderizar el ícono equivocado (SSR no sabe el tema).
  const [isDark, setIsDark] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"))
  }, [])

  function toggle() {
    const next = !document.documentElement.classList.contains("dark")
    document.documentElement.classList.toggle("dark", next)
    try {
      localStorage.setItem("theme", next ? "dark" : "light")
    } catch {
      // localStorage puede fallar (modo privado); el toggle igual funciona en la sesión.
    }
    setIsDark(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={isDark ? "Modo claro" : "Modo oscuro"}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-black/[.04] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[.06] dark:hover:text-zinc-100",
        className,
      )}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

function SunIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}
