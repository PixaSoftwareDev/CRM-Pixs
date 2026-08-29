import Link from "next/link"
import { notFound } from "next/navigation"
import { DocumentsCard } from "@/components/documents/DocumentsCard"
import { GlobeIcon, MailIcon, PhoneIcon } from "@/components/icons"
import { Timeline } from "@/components/Timeline"
import { Badge, Card } from "@/components/ui"
import type { ProjectState } from "@/db/schema"
import { formatDate } from "@/lib/utils"
import {
  getContact,
  getContactPending,
  listContactPayments,
  listContactPeople,
  listContactProjects,
} from "@/modules/contacts/queries"
import { ContactActions } from "../ContactActions"
import { ContactPeople } from "../ContactPeople"
import { Avatar } from "../contact-ui"
import { ContactPayments } from "./ContactPayments"

export const dynamic = "force-dynamic"

const PROJECT_TONE: Record<ProjectState, "green" | "amber" | "blue" | "red"> = {
  activo: "green",
  pausado: "amber",
  finalizado: "blue",
  cancelado: "red",
}

export default async function ContactoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [c, personas, pagos, pendiente, proyectos] = await Promise.all([
    getContact(id),
    listContactPeople(id),
    listContactPayments(id),
    getContactPending(id),
    listContactProjects(id),
  ])
  if (!c) notFound()

  const tel = c.telefono?.replace(/[^\d+]/g, "")

  // Resumen de proyectos del cliente.
  const activos = proyectos.filter((p) => p.estado === "activo")

  return (
    <div className="animate-slide-up">
      <Link href="/contactos" className="text-sm text-zinc-500 hover:underline">
        ← Clientes
      </Link>

      {/* Hero */}
      <div className="relative mt-3 overflow-hidden rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.12] dark:bg-zinc-900">
        <ContactActions contact={c} onDeletedHref="/contactos" className="absolute right-4 top-4" />
        <div className="flex flex-col gap-5 pr-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <Avatar nombre={c.nombre} size="lg" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{c.nombre}</h1>
              {c.personaContacto ? (
                <p className="mt-0.5 truncate text-zinc-500">{c.personaContacto}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                {c.source !== "manual" ? <Badge tone="violet">{c.source}</Badge> : null}
                <span>Alta {formatDate(c.createdAt)}</span>
              </div>
            </div>
          </div>

          {/* Accesos rápidos */}
          {c.email || tel || c.sitioWeb ? (
            <div className="flex flex-wrap gap-2 lg:shrink-0 lg:justify-end">
              {c.email ? (
                <QuickLink href={`mailto:${c.email}`} label={c.email}>
                  <MailIcon />
                </QuickLink>
              ) : null}
              {tel ? (
                <QuickLink href={`tel:${tel}`} label={c.telefono ?? tel}>
                  <PhoneIcon />
                </QuickLink>
              ) : null}
              {c.sitioWeb ? (
                <QuickLink href={c.sitioWeb} label={c.sitioWeb} external>
                  <GlobeIcon />
                </QuickLink>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Contenido principal (izq) + datos del cliente (der, sticky) */}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-6">
          {/* Proyectos del cliente: el trabajo que le hacés */}
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Proyectos</h2>
              <span className="text-xs text-zinc-400">
                {proyectos.length} {proyectos.length === 1 ? "proyecto" : "proyectos"}
                {activos.length > 0
                  ? ` · ${activos.length} activo${activos.length === 1 ? "" : "s"}`
                  : ""}
              </span>
            </div>
            {proyectos.length === 0 ? (
              <p className="text-sm text-zinc-400">
                Sin proyectos todavía. Creá uno en{" "}
                <Link
                  href="/proyectos"
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  Proyectos
                </Link>
                .
              </p>
            ) : (
              <ul className="divide-y divide-black/[.06] dark:divide-white/[.08]">
                {proyectos.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5 text-sm"
                  >
                    <Link
                      href={`/proyectos/${p.id}`}
                      className="truncate font-medium hover:underline"
                    >
                      {p.nombre}
                    </Link>
                    <Badge tone={PROJECT_TONE[p.estado]}>{p.estado}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Personas de contacto (varias por empresa) */}
          <ContactPeople contactId={c.id} people={personas} />

          {/* Cobros: se cargan acá mismo, sin pasar por oportunidad ni proyecto */}
          <ContactPayments contactId={c.id} pagos={pagos} pendiente={pendiente} />

          {/* Documentos */}
          <DocumentsCard entityType="contact" entityId={c.id} />

          {/* Actividad */}
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Actividad</h2>
            <Timeline entityType="contact" entityId={c.id} revalidate={`/contactos/${c.id}`} />
          </Card>
        </div>

        {/* Datos del cliente */}
        <Card className="space-y-4 lg:sticky lg:top-8">
          <h2 className="text-sm font-semibold">Datos</h2>
          <Detail label="Email" value={c.email ?? "—"} />
          <Detail label="Teléfono" value={c.telefono ?? "—"} />
          <Detail
            label="Sitio web"
            value={
              c.sitioWeb ? (
                <a
                  href={c.sitioWeb}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  {c.sitioWeb}
                </a>
              ) : (
                "—"
              )
            }
          />
          <Detail label="Origen" value={c.source} />
          {c.notas ? <Detail label="Notas" value={c.notas} /> : null}
        </Card>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="mt-0.5 whitespace-pre-wrap break-words text-sm">{value}</div>
    </div>
  )
}

function QuickLink({
  href,
  label,
  external,
  children,
}: {
  href: string
  label: string
  external?: boolean
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="inline-flex max-w-full items-center gap-2 rounded-lg border border-black/[.08] bg-zinc-50 px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-100 dark:border-white/[.12] dark:bg-zinc-800/50 dark:text-zinc-200 dark:hover:bg-zinc-800"
    >
      <span className="text-zinc-400">{children}</span>
      <span className="truncate">{label}</span>
    </a>
  )
}
