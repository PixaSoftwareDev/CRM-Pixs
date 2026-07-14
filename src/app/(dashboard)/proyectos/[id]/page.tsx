import Link from "next/link"
import { notFound } from "next/navigation"
import { DocumentsCard } from "@/components/documents/DocumentsCard"
import { Timeline } from "@/components/Timeline"
import { Badge, Card } from "@/components/ui"
import { getProject, getTechInfo } from "@/modules/projects/queries"
import { ProjectPayments } from "./ProjectPayments"
import { TechInfoForm } from "./TechInfoForm"

export const dynamic = "force-dynamic"

export default async function ProyectoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [project, tech] = await Promise.all([getProject(id), getTechInfo(id)])
  if (!project) notFound()

  return (
    <div>
      <Link href="/proyectos" className="text-sm text-zinc-500 hover:underline">
        ← Proyectos
      </Link>
      <div className="mt-2 mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{project.nombre}</h1>
          <Link
            href={`/contactos/${project.contactId}`}
            className="text-sm text-zinc-500 hover:text-zinc-800 hover:underline dark:hover:text-zinc-200"
          >
            {project.contactoNombre}
          </Link>
        </div>
        <Badge tone="green">{project.estado}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Info técnica</h2>
          <div className="mb-4">
            <TechInfoForm projectId={id} />
          </div>
          {tech.length === 0 ? (
            <p className="text-sm text-zinc-400">Sin info técnica cargada.</p>
          ) : (
            <ul className="space-y-2">
              {tech.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <Badge>{t.tipo}</Badge>
                  <span className="font-medium">{t.label}:</span>
                  <span className="truncate text-zinc-500">{t.valor}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <ProjectPayments projectId={id} />
      </div>

      <div className="mt-6">
        <DocumentsCard entityType="project" entityId={id} />
      </div>

      <Card className="mt-6">
        <h2 className="mb-3 text-sm font-semibold">Actividad</h2>
        <Timeline entityType="project" entityId={id} revalidate={`/proyectos/${id}`} />
      </Card>
    </div>
  )
}
