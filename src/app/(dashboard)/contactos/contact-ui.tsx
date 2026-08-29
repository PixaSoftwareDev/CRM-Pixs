import { cn } from "@/lib/utils"

/** Iniciales para el avatar: hasta 2 letras del nombre. */
export function contactInitials(nombre: string) {
  const parts = nombre.trim().split(/\s+/).slice(0, 2)
  const ini = parts.map((p) => p[0]?.toUpperCase() ?? "").join("")
  return ini || "?"
}

/** Avatar circular con iniciales sobre un degradado. */
export function Avatar({ nombre, size = "md" }: { nombre: string; size?: "sm" | "md" | "lg" }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-700 to-sky-700 font-semibold text-white shadow-sm",
        size === "lg" && "h-16 w-16 text-xl",
        size === "md" && "h-10 w-10 text-sm",
        size === "sm" && "h-7 w-7 text-[0.6875rem]",
      )}
      aria-hidden="true"
    >
      {contactInitials(nombre)}
    </div>
  )
}
