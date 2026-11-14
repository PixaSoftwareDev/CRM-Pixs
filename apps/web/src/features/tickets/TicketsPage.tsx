import { TICKET_PRIORITIES, TICKET_STATUSES, TICKET_TYPES, type TicketListItem } from "@crm/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { Archive, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "../../components/layout/AppLayout";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Chip } from "../../components/ui/Chip";
import { cn } from "../../components/ui/cn";
import { Field, Input, Select } from "../../components/ui/Field";
import { Notice, useNotice } from "../../components/ui/Notice";
import { Empty, ErrorBox, Skeleton } from "../../components/ui/States";
import { useDebounced } from "../../hooks/useDebounced";
import { when } from "../../lib/format";
import { ticketsRoute } from "../../router";
import { useClientOptions, useTeam } from "../tasks/api";
import { arParts, todayAr } from "../tasks/time";
import { useTickets } from "./api";
import { TICKET_PRIORITY, TICKET_STATUS, TICKET_TYPE } from "./labels";
import { NewTicketDialog } from "./NewTicketDialog";

type Search = ReturnType<typeof ticketsRoute.useSearch>;

export function TicketsPage() {
  const search = ticketsRoute.useSearch();
  const navigate = useNavigate({ from: ticketsRoute.fullPath });
  const clients = useClientOptions();
  const team = useTeam();
  const notice = useNotice();
  const [creating, setCreating] = useState(false);

  // Los campos de texto se escriben libres y van a la URL con un respiro.
  const [q, setQ] = useState(search.q ?? "");
  const [nro, setNro] = useState(search.nro?.toString() ?? "");
  const dq = useDebounced(q, 300);
  const dnro = useDebounced(nro, 300);

  const set = (patch: Partial<Search>) => void navigate({ search: (s) => ({ ...s, ...patch }), replace: true });

  useEffect(() => {
    const n = Number(dnro);
    set({ q: dq.trim() || undefined, nro: Number.isInteger(n) && n > 0 ? n : undefined });
  }, [dq, dnro]);

  const tickets = useTickets({
    number: search.nro,
    clientId: search.cliente,
    type: search.tipo,
    priority: search.urgencia,
    status: search.estado,
    open: search.abiertos ? "1" : undefined,
    receivedOn: search.carga,
    dueOn: search.compromiso,
    resolvedOn: search.resuelto,
    resolvedById: search.resolvio,
    q: search.q,
    archived: search.baja ? "1" : undefined,
  });

  const filtered = Object.values(search).some((v) => v !== undefined);
  const items = tickets.data?.pages.flatMap((p) => p.items) ?? [];

  const clear = () => {
    setQ("");
    setNro("");
    void navigate({ search: {}, replace: true });
  };

  return (
    <>
      <PageHeader
        title="Tickets de soporte"
        subtitle="Filtrá arriba y abajo ves los tickets. Tocá uno para ver su seguimiento."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden /> Cargar ticket
          </Button>
        }
      />

      <Card className="flex flex-col gap-3 p-4" aria-label="Filtros de búsqueda">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex flex-wrap items-center gap-2">
            <strong>Filtros de búsqueda</strong>
            <Button
              size="sm"
              variant={search.abiertos ? "primary" : "secondary"}
              aria-pressed={!!search.abiertos}
              onClick={() => set({ abiertos: search.abiertos ? undefined : true, estado: undefined })}
            >
              Solo abiertos
            </Button>
            <Button
              size="sm"
              variant={search.baja ? "primary" : "secondary"}
              aria-pressed={!!search.baja}
              onClick={() => set({ baja: search.baja ? undefined : true })}
            >
              <Archive size={13} aria-hidden /> Ver dados de baja
            </Button>
          </span>
          <span className="flex items-center gap-3 text-muted">
            {items.length}
            {tickets.hasNextPage ? "+" : ""} tickets
            {filtered && (
              <Button size="sm" variant="ghost" onClick={clear}>
                Quitar filtros
              </Button>
            )}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Nro. ticket">
            <Input inputMode="numeric" placeholder="#" value={nro} onChange={(e) => setNro(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Cliente">
            <Select value={search.cliente ?? ""} onChange={(e) => set({ cliente: e.target.value || undefined })}>
              <option value="">Todos</option>
              {clients.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo">
            <Select value={search.tipo ?? ""} onChange={(e) => set({ tipo: (e.target.value || undefined) as Search["tipo"] })}>
              <option value="">Todos</option>
              {TICKET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TICKET_TYPE[t].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Urgencia">
            <Select value={search.urgencia ?? ""} onChange={(e) => set({ urgencia: (e.target.value || undefined) as Search["urgencia"] })}>
              <option value="">Todas</option>
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {TICKET_PRIORITY[p].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estado">
            <Select
              value={search.estado ?? ""}
              onChange={(e) => set({ estado: (e.target.value || undefined) as Search["estado"], abiertos: undefined })}
            >
              <option value="">Todos</option>
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TICKET_STATUS[s].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha de carga">
            <Input type="date" value={search.carga ?? ""} onChange={(e) => set({ carga: e.target.value || undefined })} />
          </Field>
          <Field label="Fecha de compromiso">
            <Input type="date" value={search.compromiso ?? ""} onChange={(e) => set({ compromiso: e.target.value || undefined })} />
          </Field>
          <Field label="Resuelto el">
            <Input type="date" value={search.resuelto ?? ""} onChange={(e) => set({ resuelto: e.target.value || undefined })} />
          </Field>
          <Field label="Resolvió">
            <Select value={search.resolvio ?? ""} onChange={(e) => set({ resolvio: e.target.value || undefined })}>
              <option value="">Cualquiera</option>
              {team.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Buscar en título o descripción">
            <Input placeholder="Ej: factura, mails, panel…" value={q} onChange={(e) => setQ(e.target.value)} />
          </Field>
        </div>
      </Card>

      {tickets.error ? (
        <ErrorBox error={tickets.error} onRetry={() => void tickets.refetch()} />
      ) : tickets.isPending ? (
        <Skeleton className="h-64" />
      ) : items.length === 0 ? (
        <Empty>
          {search.baja
            ? "No hay tickets dados de baja con esos filtros."
            : filtered
              ? "Ningún ticket coincide con los filtros."
              : "Todavía no hay tickets."}
        </Empty>
      ) : (
        <Card className={cn("overflow-x-auto", tickets.isPlaceholderData && "opacity-60")}>
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50 text-left text-[11px] font-semibold tracking-wider text-muted uppercase">
                <th className="px-4 py-2.5">Nro.</th>
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5">Tipo</th>
                <th className="px-4 py-2.5">Título del ticket</th>
                <th className="px-4 py-2.5">Urgencia</th>
                <th className="px-4 py-2.5">Estado</th>
                <th className="px-4 py-2.5">Carga</th>
                <th className="px-4 py-2.5">Compromiso</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <TicketRow key={t.id} ticket={t} />
              ))}
            </tbody>
          </table>
          {tickets.hasNextPage && (
            <div className="border-t border-line p-3 text-center">
              <Button variant="secondary" size="sm" onClick={() => void tickets.fetchNextPage()} disabled={tickets.isFetchingNextPage}>
                Ver más
              </Button>
            </div>
          )}
        </Card>
      )}

      <NewTicketDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id, number) => {
          notice.show(`Ticket #${number} cargado.`);
          void navigate({ to: "/tickets/$ticketId", params: { ticketId: id } });
        }}
      />
      <Notice message={notice.message} />
    </>
  );
}

function TicketRow({ ticket: t }: { ticket: TicketListItem }) {
  const type = TICKET_TYPE[t.type];
  const closed = t.status === "resuelto" || t.status === "cancelado";
  const dueToday = !closed && !t.overdue && t.dueAt !== null && arParts(t.dueAt).date === todayAr();
  const cell = "px-4 py-3";
  return (
    <tr className="relative border-b border-slate-100 last:border-0 hover:bg-slate-50">
      <td className={cn(cell, "text-muted tabular-nums")}>
        {/* El link cubre toda la fila: se navega con teclado y se puede abrir en otra pestaña. */}
        <Link to="/tickets/$ticketId" params={{ ticketId: t.id }} className="after:absolute after:inset-0">
          #{t.number}
        </Link>
      </td>
      <td className={cn(cell, "font-medium")}>{t.client.name}</td>
      <td className={cell}>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: type.color }} aria-hidden />
          {type.label}
        </span>
      </td>
      <td className={cn(cell, closed ? "text-muted" : "font-semibold")}>{t.title}</td>
      <td className={cell}>
        <Chip tone={TICKET_PRIORITY[t.priority].tone}>{TICKET_PRIORITY[t.priority].label}</Chip>
      </td>
      <td className={cell}>
        <Chip tone={TICKET_STATUS[t.status].tone}>{TICKET_STATUS[t.status].label}</Chip>
        {(t.archivedAt || t.projectArchived) && (
          <span className="block pt-1 text-xs text-muted">{t.archivedAt ? "De baja" : "Proyecto de baja"}</span>
        )}
      </td>
      <td className={cell}>
        {when(t.receivedAt)}
        <span className="block text-xs text-muted">por {t.reportedBy?.name ?? "canal automático"}</span>
      </td>
      <td className={cn(cell, t.overdue && "font-bold text-red-700", dueToday && "font-bold text-amber-700")}>
        {t.dueAt ? when(t.dueAt, false) : "—"}
        <span className="block text-xs font-normal">
          {t.overdue ? "vencido" : dueToday ? "vence hoy" : t.status === "resuelto" ? "cumplido" : ""}
        </span>
      </td>
    </tr>
  );
}
