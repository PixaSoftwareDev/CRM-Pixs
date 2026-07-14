import { cn } from "@/lib/utils"

/** Iniciales para el avatar: hasta 2 letras del nombre. */
export function contactInitials(nombre: string) {
  const parts = nombre.trim().split(/\s+/).slice(0, 2)
  const ini = parts.map((p) => p[0]?.toUpperCase() ?? "").join("")
  return ini || "?"
}

/** Avatar circular con iniciales sobre un degradado. */
export function Avatar({ nombre, size = "md" }: { nombre: string; size?: "md" | "lg" }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600 font-semibold text-white shadow-sm",
        size === "lg" ? "h-16 w-16 text-xl" : "h-10 w-10 text-sm",
      )}
      aria-hidden="true"
    >
      {contactInitials(nombre)}
    </div>
  )
}
