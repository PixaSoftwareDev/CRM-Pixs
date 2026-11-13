import { Link } from "@tanstack/react-router";
import { Card } from "../../../components/ui/Card";
import { Chip } from "../../../components/ui/Chip";
import { Empty, ErrorBox, Skeleton } from "../../../components/ui/States";
import { day } from "../../../lib/format";
import { useClientProjects } from "../api";
import { PROJECT_STATUS } from "../labels";

export function ProjectsTab({ clientId }: { clientId: string }) {
  const projects = useClientProjects(clientId);

  if (projects.error) return <ErrorBox error={projects.error} onRetry={() => void projects.refetch()} />;
  if (projects.isPending) return <Skeleton className="h-24" />;
  if (projects.data.length === 0) return <Empty>Este cliente todavía no tiene proyectos.</Empty>;

  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[680px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-slate-50 text-left text-[11px] font-semibold tracking-wider text-muted uppercase">
            <th className="px-4 py-2.5">Proyecto</th>
            <th className="px-4 py-2.5">Inicio</th>
            <th className="px-4 py-2.5">Entrega</th>
            <th className="px-4 py-2.5">Tickets pendientes</th>
            <th className="px-4 py-2.5">Tickets finalizados</th>
            <th className="px-4 py-2.5">Avance</th>
          </tr>
        </thead>
        <tbody>
          {projects.data.map((p) => {
            const st = PROJECT_STATUS[p.status] ?? { label: p.status, tone: "slate" as const };
            const progress = p.progress;
            return (
              <tr key={p.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <span className="flex flex-wrap items-center gap-2 font-semibold">
                    <Link to="/proyectos/$projectId" params={{ projectId: p.id }} className="hover:underline">
                      {p.name}
                    </Link>{" "}
                    <Chip tone={st.tone}>{st.label}</Chip>
                  </span>
                </td>
                <td className="px-4 py-3">{day(p.startsOn)}</td>
                <td className="px-4 py-3">
                  {day(p.dueOn)}
                  {p.dueOn && p.dueIsEstimate && <span className="ml-1 text-xs text-muted">estimada</span>}
                </td>
                <td className="px-4 py-3">
                  <Chip tone={p.openTickets ? "amber" : "slate"}>{p.openTickets}</Chip>
                  {p.overdueTickets > 0 && (
                    <span className="ml-2 text-xs font-semibold text-red-700">{p.overdueTickets} atrasados</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Chip tone="green">{p.resolvedTickets}</Chip>
                </td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                      <span className="block h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
                    </span>
                    <strong className="text-xs">{progress}%</strong>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
