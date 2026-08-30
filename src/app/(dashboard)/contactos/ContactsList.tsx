import Link from "next/link"
import { UserIcon } from "@/components/icons"
import { Badge } from "@/components/ui"
import type { Contact } from "@/db/schema"
import { cn, formatDate } from "@/lib/utils"
import type { ContactSort, SortDir } from "@/modules/contacts/queries"
import { ContactActions } from "./ContactActions"

// Clases compartidas de celda, para no repetirlas columna por columna.
const TH = "px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-500"
const TD = "px-4 py-2 align-middle"

type Props = {
  contactos: Contact[]
  q?: string
  sort: ContactSort
  dir: SortDir
}

/** Columnas de la tabla. `oculta` las va escondiendo en pantallas chicas. */
const COLUMNAS: { key: ContactSort; label: string; oculta?: string }[] = [
  { key: "nombre", label: "Cliente" },
  { key: "personaContacto", label: "Contacto", oculta: "hidden sm:table-cell" },
  { key: "email", label: "Email", oculta: "hidden lg:table-cell" },
  { key: "telefono", label: "Teléfono", oculta: "hidden xl:table-cell" },
  { key: "source", label: "Origen", oculta: "hidden md:table-cell" },
  { key: "createdAt", label: "Alta", oculta: "hidden sm:table-cell" },
]

/**
 * Listado de clientes en tabla: encabezado y columnas alineadas, para poder
 * recorrer una columna con la vista en lugar de leer fila por fila. Tocando un
 * encabezado se ordena por esa columna; el orden viaja en la URL.
 */
export function ContactsList({ contactos, q, sort, dir }: Props) {
  /** Enlace del encabezado: misma columna alterna el sentido; otra, arranca ascendente. */
  function hrefOrden(key: ContactSort) {
    const params = new URLSearchParams()
    if (q) params.set("q", q)
    params.set("sort", key)
    params.set("dir", sort === key && dir === "asc" ? "desc" : "asc")
    return `/contactos?${params.toString()}`
  }

  return (
    <div className="animate-slide-up overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.12]">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black/[.08] bg-zinc-50 text-left dark:border-white/[.12] dark:bg-zinc-900">
            {COLUMNAS.map((col) => {
              const activa = sort === col.key
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={activa ? (dir === "asc" ? "ascending" : "descending") : "none"}
                  className={cn(TH, col.oculta, col.key === "nombre" && "w-[30%]")}
                >
                  <Link
                    href={hrefOrden(col.key)}
                    className={cn(
                      "inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-zinc-900 dark:hover:text-zinc-100",
                      activa && "text-zinc-900 dark:text-zinc-100",
                    )}
                  >
                    {col.label}
                    <span
                      aria-hidden="true"
                      className={cn("text-[0.6rem]", !activa && "opacity-0")}
                    >
                      {dir === "asc" ? "▲" : "▼"}
                    </span>
                  </Link>
                </th>
              )
            })}
            <th className={cn(TH, "w-10")}>
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {contactos.map((c, i) => (
            <tr
              key={c.id}
              className={cn(
                "relative bg-white transition-colors hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/50",
                i > 0 && "border-t border-black/[.06] dark:border-white/[.08]",
              )}
            >
              <td className={TD}>
                {/* El seudoelemento cubre la fila entera: se puede hacer clic en
                    cualquier parte, sin anidar enlaces dentro de la tabla. */}
                <Link
                  href={`/contactos/${c.id}`}
                  className="block truncate font-medium after:absolute after:inset-0"
                >
                  {c.nombre}
                </Link>
              </td>
              <td className={cn(TD, "hidden sm:table-cell")}>
                {c.personaContacto ? (
                  <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
                    <UserIcon size={13} className="shrink-0 opacity-60" />
                    <span className="truncate">{c.personaContacto}</span>
                  </span>
                ) : (
                  <span className="text-zinc-400">—</span>
                )}
              </td>
              <td className={cn(TD, "hidden text-zinc-500 lg:table-cell")}>
                <span className="truncate">{c.email || "—"}</span>
              </td>
              <td className={cn(TD, "hidden whitespace-nowrap text-zinc-500 xl:table-cell")}>
                {c.telefono || "—"}
              </td>
              <td className={cn(TD, "hidden md:table-cell")}>
                {c.source !== "manual" ? (
                  <Badge tone="violet">{c.source}</Badge>
                ) : (
                  <span className="text-zinc-400">—</span>
                )}
              </td>
              <td
                className={cn(TD, "hidden whitespace-nowrap text-xs text-zinc-400 sm:table-cell")}
              >
                {formatDate(c.createdAt)}
              </td>
              <td className={cn(TD, "text-right")}>
                <ContactActions contact={c} className="relative z-10" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
