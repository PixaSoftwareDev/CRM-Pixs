import Link from "next/link"
import { notFound } from "next/navigation"
import { Timeline } from "@/components/Timeline"
import { Badge, Card, PageHeader } from "@/components/ui"
import { getProject, getTechInfo } from "@/modules/projects/queries"
import { listTasks } from "@/modules/tasks/queries"
import { ProjectPayments } from "./ProjectPayments"
import { TaskBoard } from "./TaskBoard"
import { TechInfoForm } from "./TechInfoForm"

export const dynamic = "force-dynamic"

export default async function ProyectoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [project, tasks, tech] = await Promise.all([getProject(id), listTasks(id), getTechInfo(id)])
  if (!project) notFound()

  return (
    <div>
      <Link href="/proyectos" className="text-sm text-zinc-500 hover:underline">
        ← Proyectos
      </Link>
      <div className="mt-2 mb-6 flex items-center justify-between gap-4">
        <PageHeader title={project.nombre} subtitle={project.contactoNombre} />
        <Badge tone="green">{project.estado}</Badge>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold">Tareas</h2>
        <TaskBoard projectId={id} initial={tasks} />
      </section>

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

      <Card className="mt-6">
        <h2 className="mb-3 text-sm font-semibold">Actividad</h2>
        <Timeline entityType="project" entityId={id} revalidate={`/proyectos/${id}`} />
      </Card>
    </div>
  )
}
