import type { AutomationRuleDto, RuleRunResult } from "@crm/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Plug, Zap } from "lucide-react";
import { PageHeader } from "../../components/layout/AppLayout";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { cn } from "../../components/ui/cn";
import { Notice, useNotice } from "../../components/ui/Notice";
import { ErrorBox, Skeleton } from "../../components/ui/States";
import { api } from "../../lib/api";
import { ago, plural } from "../../lib/format";

const KEY = ["automations"] as const;

export function AutomationsPage() {
  const qc = useQueryClient();
  const notice = useNotice();
  const rules = useQuery({ queryKey: KEY, queryFn: () => api.get<AutomationRuleDto[]>("/api/automations") });
  // Una corrida puede crear tareas, facturas o cambiar proyectos: se refresca todo.
  const refresh = () => qc.invalidateQueries();
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => api.patch(`/api/automations/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  const run = useMutation({
    mutationFn: (id: string) => api.post<RuleRunResult>(`/api/automations/${id}/run`),
    onSuccess: (r) => (notice.show(r.detail), refresh()),
  });

  if (rules.error) return <ErrorBox error={rules.error} onRetry={() => void rules.refetch()} />;
  if (rules.isPending) return <Skeleton className="h-96" />;

  const total = rules.data.reduce((a, r) => a + r.runsThisMonth, 0);
  const ready = rules.data.filter((r) => r.available);
  const waiting = rules.data.filter((r) => !r.available);

  return (
    <>
      <PageHeader
        title="Automatizaciones"
        subtitle={`Reglas simples: cuando pasa algo, el sistema hace el trabajo por vos. Este mes: ${plural(total, "acción automática", "acciones automáticas")}.`}
      />
      <p className="text-sm text-muted">
        Las reglas programadas corren solas una vez por día a partir de las 7. Con «Ejecutar ahora» podés correrlas en el momento; si ya
        hicieron su trabajo, no duplican nada.
      </p>
      {(toggle.error ?? run.error) && (
        <p role="alert" className="rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700">
          {(toggle.error ?? run.error)?.message}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {ready.map((r) => (
          <RuleCard
            key={r.id}
            rule={r}
            busy={(toggle.isPending && toggle.variables?.id === r.id) || (run.isPending && run.variables === r.id)}
            onToggle={() => toggle.mutate({ id: r.id, enabled: !r.enabled })}
            onRun={() => run.mutate(r.id)}
          />
        ))}
      </div>

      {waiting.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="mt-2 text-sm font-bold">Necesitan una conexión</h2>
          <p className="text-sm text-muted">
            Estas reglas están listas para cuando se conecte WhatsApp o un mail saliente. Mientras tanto, la de cobranza crea la tarea para que
            alguien avise a mano.
          </p>
          {waiting.map((r) => (
            <RuleCard key={r.id} rule={r} busy={false} />
          ))}
        </section>
      )}
      <Notice message={notice.message} />
    </>
  );
}

/** Las reglas que esperan una conexión se muestran sin acciones (no hay nada que activar todavía). */
function RuleCard({
  rule: r,
  busy,
  onToggle,
  onRun,
}: {
  rule: AutomationRuleDto;
  busy: boolean;
  onToggle?: () => void;
  onRun?: () => void;
}) {
  const on = r.enabled || r.builtIn;
  const stats = !r.available
    ? `Necesita: ${r.requires}`
    : r.builtIn
      ? `Siempre activa: es parte de «Venta ganada»${r.runsThisMonth ? ` · ${plural(r.runsThisMonth, "vez", "veces")} este mes` : ""}`
      : !r.enabled
        ? "Pausada"
        : r.runsThisMonth
          ? `Activa · hizo ${plural(r.runsThisMonth, "acción", "acciones")} este mes${r.lastRunAt ? ` · última corrida ${ago(r.lastRunAt)}` : ""}`
          : `Activa · todavía no hizo nada este mes${r.lastRunAt ? ` · última corrida ${ago(r.lastRunAt)}` : ""}`;

  return (
    <Card className={cn("flex flex-wrap items-center gap-4 p-4", !on && "opacity-70")}>
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          on ? "bg-indigo-50 text-brand" : "bg-slate-100 text-slate-400",
        )}
        aria-hidden
      >
        {r.available ? <Zap size={18} /> : <Plug size={18} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="text-muted">Cuando</span> {r.when} <span className="text-muted">entonces</span> <strong>{r.then}</strong>
        </p>
        <p className={cn("text-xs", r.available ? "text-muted" : "font-semibold text-amber-800")}>{stats}</p>
        {r.lastError && r.enabled && <p className="text-xs text-red-700">Último error: {r.lastError}</p>}
      </div>
      {onRun && r.runnable && r.available && (
        <Button size="sm" variant="secondary" onClick={onRun} disabled={busy}>
          <Play size={13} aria-hidden /> Ejecutar ahora
        </Button>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${on ? "Pausar" : "Activar"}: ${r.name}`}
        title={!r.available ? `Para activarla: ${r.requires}` : r.builtIn ? "Es parte de «Venta ganada»: no se pausa" : undefined}
        disabled={!onToggle || !r.available || r.builtIn || busy}
        onClick={onToggle}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition disabled:cursor-not-allowed",
          on ? "bg-brand" : "bg-slate-300",
        )}
      >
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
      </button>
    </Card>
  );
}
