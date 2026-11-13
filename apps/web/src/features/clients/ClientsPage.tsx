import { CLIENT_PRIORITIES, type ClientListItem, type ClientPriority, type ClientStatus } from "@crm/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "../../components/layout/AppLayout";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Chip } from "../../components/ui/Chip";
import { cn } from "../../components/ui/cn";
import { Input } from "../../components/ui/Field";
import { Empty, ErrorBox, Skeleton } from "../../components/ui/States";
import { useDebounced } from "../../hooks/useDebounced";
import { ago, initials, money, when } from "../../lib/format";
import { clientsRoute } from "../../router";
import { useClientSummary, useClients, useUpdateClient } from "./api";
import { PRIORITY, STATUS } from "./labels";
import { NewClientDialog } from "./NewClientDialog";

const FILTERS: { key: ClientStatus | undefined; label: string }[] = [
  { key: undefined, label: "Todos" },
  { key: "potencial", label: "Potenciales" },
  { key: "activo", label: "Activos" },
  { key: "en_riesgo", label: "En riesgo" },
  { key: "baja", label: "De baja" },
];

export function ClientsPage() {
  const search = clientsRoute.useSearch();
  const navigate = useNavigate({ from: clientsRoute.fullPath });
  const [text, setText] = useState(search.q ?? "");
  const q = useDebounced(text.trim());
  const [creating, setCreating] = useState(false);

  // El texto buscado viaja a la URL (se puede compartir el link con el filtro puesto).
  useEffect(() => {
    void navigate({ search: (s) => ({ ...s, q: q || undefined }), replace: true });
  }, [q, navigate]);

  const summary = useClientSummary();
  const list = useClients({ q: search.q, status: search.status, priority: search.priority });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle={
          summary.data &&
          `${summary.data.total} clientes · ${summary.data.highPriority} con prioridad alta · ${summary.data.atRisk} en riesgo`
        }
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden /> Nuevo cliente
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative w-full max-w-[420px] flex-[1_1_320px]">
          <span className="sr-only">Buscar</span>
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Buscar por nombre, contacto o email"
            className="pl-9"
          />
        </label>
        <div role="tablist" aria-label="Filtrar por estado" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              role="tab"
              aria-selected={search.status === f.key}
              onClick={() => void navigate({ search: (s) => ({ ...s, status: f.key }) })}
              className={cn(
                "h-8 rounded-full px-3.5 text-[13px] font-medium transition",
                search.status === f.key ? "bg-ink text-white" : "border border-line bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {list.error ? (
        <ErrorBox error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50 text-left text-[11px] font-semibold tracking-wider text-muted uppercase">
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5">Estado</th>
                <th className="px-4 py-2.5">Prioridad</th>
                <th className="px-4 py-2.5">Último contacto</th>
                <th className="px-4 py-2.5">Próxima tarea</th>
                <th className="px-4 py-2.5 text-right">Cuenta corriente</th>
              </tr>
            </thead>
            <tbody className={cn(list.isPlaceholderData && "opacity-60")}>
              {list.isPending
                ? Array.from({ length: 5 }, (_, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td colSpan={6} className="px-4 py-4">
                        <Skeleton />
                      </td>
                    </tr>
                  ))
                : rows.map((c) => <ClientRow key={c.id} client={c} />)}
            </tbody>
          </table>
          {!list.isPending && rows.length === 0 && (
            <div className="p-4">
              <Empty>No encontré clientes con ese filtro.</Empty>
            </div>
          )}
          {list.hasNextPage && (
            <div className="border-t border-line p-3 text-center">
              <Button variant="secondary" size="sm" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                {list.isFetchingNextPage ? "Cargando…" : "Ver más"}
              </Button>
            </div>
          )}
        </Card>
      )}

      <p className="text-xs leading-relaxed text-muted">
        Los clientes nuevos arrancan con prioridad alta. "En riesgo" es un cliente que se puede perder; para
        marcarlo o darlo de baja hay que indicar el motivo desde su ficha.
      </p>

      <NewClientDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function ClientRow({ client: c }: { client: ClientListItem }) {
  const update = useUpdateClient(c.id);
  const status = STATUS[c.status];

  return (
    <tr className="border-b border-slate-100 align-middle last:border-0 hover:bg-slate-50/60">
      <td className="px-4 py-3">
        <Link
          to="/clientes/$clientId"
          params={{ clientId: c.id }}
          className="flex items-center gap-3 rounded-lg text-left outline-offset-2"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-indigo-50 text-[13px] font-bold text-indigo-800">
            {initials(c.name)}
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-ink">{c.name}</span>
            <span className="block truncate text-xs text-muted">{c.mainContact ?? c.email ?? "Sin contacto"}</span>
            {c.statusReason && <span className="block text-xs text-amber-700">Motivo: {c.statusReason}</span>}
          </span>
        </Link>
      </td>
      <td className="px-4 py-3">
        <Chip tone={status.tone}>{status.label}</Chip>
      </td>
      <td className="px-4 py-3">
        <select
          aria-label={`Prioridad de ${c.name}`}
          value={c.priority}
          disabled={update.isPending}
          onChange={(e) => update.mutate({ priority: e.target.value as ClientPriority })}
          className={cn(
            "h-7 rounded-full border-0 px-2.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-brand/30",
            PRIORITY[c.priority].tone === "red" && "bg-red-100 text-red-800",
            PRIORITY[c.priority].tone === "amber" && "bg-amber-100 text-amber-800",
            PRIORITY[c.priority].tone === "slate" && "bg-slate-100 text-slate-700",
          )}
        >
          {CLIENT_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY[p].label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3 text-slate-600">{ago(c.lastContactAt)}</td>
      <td className="px-4 py-3">
        {c.nextTask ? (
          <span className="block max-w-[220px]">
            <span className="block truncate">{c.nextTask.title}</span>
            <span className="text-xs text-muted">{when(c.nextTask.startsAt)}</span>
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          to="/clientes/$clientId"
          params={{ clientId: c.id }}
          search={{ tab: "cuenta" }}
          className="inline-flex flex-col items-end"
        >
          <strong className={cn("tabular-nums", c.hasOverdueDebt ? "text-red-700" : c.balance > 0 ? "text-ink" : "text-slate-500")}>
            {money(c.balance)}
          </strong>
          <span className="text-xs text-brand">{c.hasOverdueDebt ? "Deuda vencida →" : "Ver cta. cte. →"}</span>
        </Link>
      </td>
    </tr>
  );
}
