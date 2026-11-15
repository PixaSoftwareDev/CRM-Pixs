import { PROJECT_HEALTHS, type ProjectListItem } from "@crm/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { Archive, Plus, Zap } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../../components/layout/AppLayout";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Chip } from "../../components/ui/Chip";
import { cn } from "../../components/ui/cn";
import { Field, Select } from "../../components/ui/Field";
import { Empty, ErrorBox, Skeleton } from "../../components/ui/States";
import { day, initials, plural } from "../../lib/format";
import { projectsRoute } from "../../router";
import { todayAr } from "../tasks/time";
import { useProjects } from "./api";
import { alertsOf, HEALTH, PHASE } from "./labels";
import { ProjectFormDialog } from "./ProjectFormDialog";
import { useTitle } from "../../hooks/useTitle";

export function ProjectsPage() {
  useTitle("Proyectos");
  const search = projectsRoute.useSearch();
  const navigate = useNavigate({ from: projectsRoute.fullPath });
  const archived = !!search.baja;
  const projects = useProjects({ archived });
  const [creating, setCreating] = useState(false);

  const setFilter = (patch: Partial<typeof search>) =>
    void navigate({ search: (s) => ({ ...s, ...patch }), replace: true });

  if (projects.error) return <ErrorBox error={projects.error} onRetry={() => void projects.refetch()} />;

  const all = projects.data ?? [];
  const shown = all.filter(
    (p) =>
      (!search.cliente || p.client.id === search.cliente) &&
      (!search.impl || p.implementer?.id === search.impl) &&
      (!search.estado || p.health === search.estado),
  );
  const count = (h: string) => all.filter((p) => p.health === h).length;
  const active = all.filter((p) => p.health !== "terminado" && p.health !== "cancelado").length;
  const filtered = !!(search.cliente || search.impl || search.estado);
  const kind = archived ? "proyectos dados de baja" : "proyectos";

  const clients = unique(all.map((p) => p.client));
  const implementers = unique(all.flatMap((p) => (p.implementer ? [p.implementer] : [])));

  return (
    <>
      <PageHeader
        title="Proyectos"
        subtitle={
          archived
            ? `${plural(all.length, "dado de baja", "dados de baja")}: no aparecen en listados ni selectores`
            : `${plural(active, "activo", "activos")} · ${count("en_riesgo")} en riesgo · ${plural(count("nuevo"), "nuevo", "nuevos")} recién salido de ventas`
        }
        actions={
          <Button variant="secondary" onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden /> Proyecto manual
          </Button>
        }
      />

      <p className="flex gap-2 rounded-xl bg-purple-50 px-4 py-3 text-sm text-purple-950">
        <Zap size={16} aria-hidden className="mt-0.5 shrink-0" />
        <span>
          Los proyectos se crean solos: cuando una venta se gana en el{" "}
          <Link to="/embudo" className="font-semibold underline">
            embudo
          </Link>
          , se arma el proyecto con los datos de la venta y del contacto y se le asigna al implementador.
        </span>
      </p>

      <Card className="flex flex-col gap-3 p-4" aria-label="Filtros de proyectos">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <strong>Filtros</strong>
          <span className="flex items-center gap-3 text-muted">
            {shown.length} de {all.length} {kind}
            <Button
              size="sm"
              variant={archived ? "primary" : "secondary"}
              aria-pressed={archived}
              onClick={() => setFilter({ baja: archived ? undefined : true })}
            >
              <Archive size={13} aria-hidden /> {archived ? "Volver a los activos" : "Ver dados de baja"}
            </Button>
            {filtered && (
              <Button size="sm" variant="ghost" onClick={() => setFilter({ cliente: undefined, impl: undefined, estado: undefined })}>
                Quitar filtros
              </Button>
            )}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Cliente">
            <Select value={search.cliente ?? ""} onChange={(e) => setFilter({ cliente: e.target.value || undefined })}>
              <option value="">Todos</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Implementador">
            <Select value={search.impl ?? ""} onChange={(e) => setFilter({ impl: e.target.value || undefined })}>
              <option value="">Todos</option>
              {implementers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estado del proyecto">
            <Select
              value={search.estado ?? ""}
              onChange={(e) => setFilter({ estado: (e.target.value || undefined) as typeof search.estado })}
            >
              <option value="">Todos</option>
              {PROJECT_HEALTHS.map((h) => (
                <option key={h} value={h}>
                  {HEALTH[h].label} ({count(h)})
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {projects.isPending ? (
        <Skeleton className="h-64" />
      ) : shown.length === 0 ? (
        <Empty>
          {filtered
            ? "Ningún proyecto coincide con los filtros."
            : archived
              ? "No hay proyectos dados de baja."
              : "Todavía no hay proyectos."}
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}

      <ProjectFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(_, id) => void navigate({ to: "/proyectos/$projectId", params: { projectId: id } })}
      />
    </>
  );
}

function ProjectCard({ project: p }: { project: ProjectListItem }) {
  const h = HEALTH[p.health];
  const alerts = alertsOf(p, todayAr());
  return (
    <Link
      to="/proyectos/$projectId"
      params={{ projectId: p.id }}
      className={cn(
        "flex min-w-0 flex-col gap-3.5 rounded-[14px] border bg-white p-5 transition hover:shadow-md",
        p.health === "nuevo" ? "border-purple-300 ring-3 ring-purple-100" : "border-line",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-bold">{p.name}</h2>
          <p className="truncate text-sm text-muted">{p.client.name}</p>
        </div>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <Chip tone={h.tone}>{h.label}</Chip>
          {p.archivedAt && <Chip tone="slate">De baja</Chip>}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="flex size-7 items-center justify-center rounded-full bg-indigo-50 text-[11px] font-bold text-indigo-800">
          {p.implementer ? initials(p.implementer.name) : "?"}
        </span>
        <span className="text-muted">Implementa</span> <strong>{p.implementer?.name ?? "sin asignar"}</strong>
        {p.createdAutomatically && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-purple-700">
            <Zap size={12} aria-hidden /> desde la venta
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-xs">
          <span>
            Etapa: <strong>{p.health === "terminado" ? "Terminado" : PHASE[p.phase]}</strong>
          </span>
          <span className="font-semibold">{p.progress}%</span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuenow={p.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Avance"
        >
          <div className="h-full rounded-full" style={{ width: `${Math.max(p.progress, 2)}%`, background: h.bar }} />
        </div>
      </div>

      <dl className="grid grid-cols-4 gap-2 border-t border-line pt-3 text-center">
        <Stat label="Pendientes" value={p.pendingTickets} />
        <Stat label="Resueltos" value={p.resolvedTickets} />
        <Stat label="Tareas" value={p.openTasks} />
        <Stat label="Entrega" value={p.dueOn ? day(p.dueOn).slice(0, 5) : "—"} />
      </dl>

      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-red-700">{alerts.join(" · ")}</span>
        <span className="shrink-0 font-semibold text-brand">Ver desglose →</span>
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="font-bold">{value}</dd>
    </div>
  );
}

function unique<T extends { id: string; name: string }>(items: T[]): T[] {
  return [...new Map(items.map((i) => [i.id, i])).values()].sort((a, b) => a.name.localeCompare(b.name));
}
