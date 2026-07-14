"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { GridIcon, ListIcon, UserIcon } from "@/components/icons"
import { Badge } from "@/components/ui"
import { ViewToggle } from "@/components/ViewToggle"
import type { Contact } from "@/db/schema"
import { cn, formatDate } from "@/lib/utils"
import { ContactActions } from "./ContactActions"
import { Avatar } from "./contact-ui"

type View = "card" | "list"
const STORAGE_KEY = "contactos_view"

export function ContactsList({ contactos }: { contactos: Contact[] }) {
  const [view, setView] = useState<View>("card")

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === "card" || saved === "list") setView(saved)
  }, [])

  function change(v: View) {
    setView(v)
    localStorage.setItem(STORAGE_KEY, v)
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-sm text-zinc-500">
          {contactos.length} {contactos.length === 1 ? "cliente" : "clientes"}
        </span>
        <ViewToggle
          value={view}
          onChange={change}
          options={[
            { value: "card", label: "Tarjetas", icon: <GridIcon /> },
            { value: "list", label: "Lista", icon: <ListIcon /> },
          ]}
        />
      </div>

      {view === "card" ? (
        <div className="grid animate-slide-up gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {contactos.map((c) => (
            <div key={c.id} className="group relative">
              <Link
                href={`/contactos/${c.id}`}
                className="block h-full rounded-xl border border-black/[.08] bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-md dark:border-white/[.12] dark:bg-zinc-900 dark:hover:border-zinc-500"
              >
                <div className="flex items-start gap-3 pr-8">
                  <Avatar nombre={c.nombre} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold leading-tight">{c.nombre}</div>
                    {c.personaContacto ? (
                      <div className="mt-1 flex items-center gap-1 truncate text-xs text-zinc-500">
                        <UserIcon size={13} className="shrink-0 opacity-70" />
                        <span className="truncate">{c.personaContacto}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-xs text-zinc-400">
                  {c.email ? <div className="truncate">{c.email}</div> : null}
                  {c.telefono ? <div className="truncate">{c.telefono}</div> : null}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  {c.source !== "manual" ? <Badge tone="violet">{c.source}</Badge> : <span />}
                  <span className="text-xs text-zinc-400">Alta {formatDate(c.createdAt)}</span>
                </div>
              </Link>
              <ContactActions contact={c} className="absolute right-3 top-3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="animate-slide-up overflow-hidden rounded-xl border border-black/[.08] dark:border-white/[.12]">
          {contactos.map((c, i) => (
            <div
              key={c.id}
              className={cn(
                "relative flex items-center gap-3 bg-white px-4 py-3 transition-colors hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/50",
                i > 0 && "border-t border-black/[.06] dark:border-white/[.08]",
              )}
            >
              <Link
                href={`/contactos/${c.id}`}
                className="flex min-w-0 flex-1 items-center gap-3 after:absolute after:inset-0"
              >
                <Avatar nombre={c.nombre} />
                <div className="min-w-0">
                  <div className="truncate font-semibold leading-tight">{c.nombre}</div>
                  <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-zinc-500">
                    {c.personaContacto ? (
                      <>
                        <UserIcon size={12} className="shrink-0 opacity-70" />
                        <span className="truncate">{c.personaContacto}</span>
                        {c.email ? <span className="text-zinc-400">· {c.email}</span> : null}
                      </>
                    ) : (
                      <span className="truncate">{c.email || "—"}</span>
                    )}
                  </div>
                </div>
              </Link>
              <div className="hidden shrink-0 text-xs text-zinc-400 sm:block">
                Alta {formatDate(c.createdAt)}
              </div>
              {c.source !== "manual" ? <Badge tone="violet">{c.source}</Badge> : null}
              <ContactActions contact={c} className="relative z-10 shrink-0" />
            </div>
          ))}
        </div>
      )}
    </>
  )
}
