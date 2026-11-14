import type { ClientDetail } from "@crm/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Copy, Mail, Phone } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Chip } from "../../components/ui/Chip";
import { ErrorBox, Skeleton } from "../../components/ui/States";
import { Tabs } from "../../components/ui/Tabs";
import { useCopy } from "../../hooks/useCopy";
import { isNotFound } from "../../lib/api";
import { ago, fullDate, initials, money, plural } from "../../lib/format";
import { clientRoute } from "../../router";
import { useClient } from "./api";
import { STATUS } from "./labels";
import { StatusDialog } from "./StatusDialog";
import { ActivityTab } from "./tabs/ActivityTab";
import { DataTab } from "./tabs/DataTab";
import { ProjectsTab } from "./tabs/ProjectsTab";
import { StatementTab } from "./tabs/StatementTab";
import { TasksTab } from "./tabs/TasksTab";

type TabKey = "actividad" | "tareas" | "cuenta" | "proyectos" | "datos";

export function ClientDetailPage() {
  const { clientId } = clientRoute.useParams();
  const { tab = "actividad" } = clientRoute.useSearch();
  const navigate = useNavigate({ from: clientRoute.fullPath });
  const client = useClient(clientId);

  if (client.error) {
    return isNotFound(client.error) ? (
      <ErrorBox error={new Error("Este cliente no existe: puede ser un link viejo o mal copiado.")} />
    ) : (
      <ErrorBox error={client.error} onRetry={() => void client.refetch()} />
    );
  }
  if (!client.data) {
    return (
      <Card className="flex flex-col gap-3 p-6">
        <Skeleton className="h-7 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
      </Card>
    );
  }

  const c = client.data;
  const setTab = (t: TabKey) => void navigate({ search: { tab: t }, replace: true });

  return (
    <>
      <Link to="/clientes" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden /> Clientes
      </Link>

      <ClientHeader client={c} />

      <section className="flex flex-col gap-4">
        <Tabs<TabKey>
          label="Secciones del cliente"
          value={tab}
          onChange={setTab}
          items={[
            { key: "actividad", label: "Actividad" },
            { key: "tareas", label: "Tareas" },
            { key: "cuenta", label: "Cuenta corriente" },
            { key: "proyectos", label: "Proyectos", badge: c.summary.activeProjects },
            { key: "datos", label: "Datos" },
          ]}
        />
        {tab === "actividad" && <ActivityTab clientId={c.id} />}
        {tab === "tareas" && <TasksTab clientId={c.id} />}
        {tab === "cuenta" && <StatementTab client={c} />}
        {tab === "proyectos" && <ProjectsTab clientId={c.id} />}
        {tab === "datos" && <DataTab client={c} />}
      </section>
    </>
  );
}

function ClientHeader({ client: c }: { client: ClientDetail }) {
  const [statusOpen, setStatusOpen] = useState(false);
  const { copied, copy } = useCopy();
  const status = STATUS[c.status];
  const main = c.contacts[0];

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-base font-bold text-indigo-800">
            {initials(c.name)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{c.name}</h1>
              <Chip tone={status.tone}>
                {status.label}
                {c.statusReason && ` · ${c.statusReason}`}
              </Chip>
            </div>
            <p className="mt-0.5 text-sm text-muted">
              Cliente desde {fullDate(c.createdAt).slice(3)}
              {main && ` · contacto principal ${main.name}`}
            </p>
          </div>
        </div>
        <Button variant="secondary" onClick={() => setStatusOpen(true)}>
          Cambiar estado
        </Button>
      </div>

      {(c.phone || c.email) && (
        <div className="flex flex-wrap gap-2">
          {c.phone && (
            <CopyPill icon={<Phone size={14} aria-hidden />} text={c.phone} done={copied === "tel"} onCopy={() => void copy("tel", c.phone ?? "")} />
          )}
          {c.email && (
            <CopyPill icon={<Mail size={14} aria-hidden />} text={c.email} done={copied === "mail"} onCopy={() => void copy("mail", c.email ?? "")} />
          )}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-4">
        <Kpi label="Saldo" value={money(c.summary.balance)} danger={c.summary.hasOverdueDebt} hint={c.summary.hasOverdueDebt ? `${money(c.summary.overdueAmount)} vencido` : undefined} />
        <Kpi label="Abono" value={c.summary.monthlySubscriptions ? `${money(c.summary.monthlySubscriptions)}/mes` : "—"} />
        <Kpi label="Proyectos" value={`${plural(c.summary.activeProjects, "activo", "activos")} · ${plural(c.summary.openTickets, "ticket", "tickets")}`} />
        <Kpi label="Último contacto" value={ago(c.summary.lastContactAt)} />
      </dl>

      <StatusDialog client={c} open={statusOpen} onClose={() => setStatusOpen(false)} />
    </Card>
  );
}

function CopyPill({ icon, text, done, onCopy }: { icon: React.ReactNode; text: string; done: boolean; onCopy: () => void }) {
  return (
    <span className="inline-flex h-8 items-center gap-2 rounded-full bg-slate-100 pr-1 pl-3 text-sm text-slate-700">
      {icon}
      {text}
      <button
        type="button"
        onClick={onCopy}
        aria-label={`Copiar ${text}`}
        className="flex size-6 items-center justify-center rounded-full text-slate-500 hover:bg-white hover:text-ink"
      >
        {done ? <Check size={13} aria-hidden className="text-green-700" /> : <Copy size={13} aria-hidden />}
      </button>
    </span>
  );
}

function Kpi({ label, value, hint, danger }: { label: string; value: string; hint?: string | undefined; danger?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={danger ? "font-bold text-red-700" : "font-bold"}>
        {value}
        {hint && <span className="ml-1.5 text-xs font-medium">{hint}</span>}
      </dd>
    </div>
  );
}
