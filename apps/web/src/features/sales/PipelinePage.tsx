import type { OpportunityCardDto, PipelineStageDto } from "@pixs/shared";
import { Link } from "@tanstack/react-router";
import { Plus, Trophy, User, Zap } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../../components/layout/AppLayout";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Chip } from "../../components/ui/Chip";
import { cn } from "../../components/ui/cn";
import { Dialog } from "../../components/ui/Dialog";
import { Select } from "../../components/ui/Field";
import { Notice, useNotice } from "../../components/ui/Notice";
import { ErrorBox, Skeleton } from "../../components/ui/States";
import { money, plural, when } from "../../lib/format";
import { TASK_STATUS, tint } from "../tasks/labels";
import { TaskDialog } from "../tasks/TaskDialog";
import { arParts } from "../tasks/time";
import { usePipeline, useMoveOpportunity, useStageOpportunities } from "./api";
import { LoseDialog, WinDialog } from "./CloseDialogs";
import { NewOpportunityDialog } from "./NewOpportunityDialog";

/** A partir de cuántos días quieta en una etapa se marca en rojo. */
const STALE_DAYS = 7;

export function PipelinePage() {
  const pipeline = usePipeline();
  const notice = useNotice();
  const [stageId, setStageId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [banner, setBanner] = useState<{ msg: string; projectId: string } | null>(null);

  if (pipeline.error) return <ErrorBox error={pipeline.error} onRetry={() => void pipeline.refetch()} />;
  if (!pipeline.data) return <Skeleton className="h-[500px]" />;

  const p = pipeline.data;
  const stage = p.stages.find((s) => s.id === stageId) ?? null;
  const last = p.stages.length - 1;

  return (
    <>
      <PageHeader
        title="Embudo de ventas"
        subtitle={`${plural(p.openCount, "oportunidad en curso", "oportunidades en curso")} · ${money(p.openTotal)} en juego · pasaron a implementación este mes ${money(p.wonThisMonth)}`}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden /> Potencial
          </Button>
        }
      />

      <p className="flex gap-2 rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-950">
        <Zap size={16} aria-hidden className="mt-0.5 shrink-0" />
        <span>
          <strong>Se gestiona solo.</strong> Cada cliente baja por el embudo según lo que pasa con sus tareas en{" "}
          <Link to="/" className="font-semibold underline">
            Mi día
          </Link>
          : llamada hecha, reunión agendada, propuesta enviada, tarea de seguimiento en curso.
        </span>
      </p>

      {banner && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-900">
          <span className="flex gap-2">
            <Trophy size={16} aria-hidden className="mt-0.5 shrink-0" />
            <span>
              <strong>¡Venta cerrada!</strong> {banner.msg}
            </span>
          </span>
          <Link to="/proyectos/$projectId" params={{ projectId: banner.projectId }} className="font-semibold underline">
            Ver el proyecto →
          </Link>
        </div>
      )}

      <div className="grid gap-[18px] lg:grid-cols-[1fr_340px]">
        <Card className="flex flex-col items-center gap-1.5 p-5">
          {p.stages.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStageId(s.id)}
              className={cn(
                "flex min-h-14 items-center justify-between gap-3 rounded-xl px-4 py-2 text-left text-white transition hover:brightness-110",
                i === last && "mt-2",
              )}
              style={{ width: `${100 - i * (40 / last)}%`, background: s.color }}
            >
              <span className="min-w-0">
                <strong className="block truncate">{s.name}</strong>
                <span className="block truncate text-xs opacity-90">{s.description}</span>
              </span>
              <span className="shrink-0 text-right">
                <strong className="block text-lg leading-tight">{s.count}</strong>
                <span className="block text-xs opacity-90">{money(s.total)}</span>
              </span>
            </button>
          ))}
          <p className="mt-3 text-center text-xs text-muted">
            Tocá una etapa para ver sus clientes y tareas. Al ganar la venta pasa a <strong>Implementación</strong> y se crea el proyecto.
          </p>
        </Card>

        <div className="flex flex-col gap-[18px]">
          <Card className="flex flex-col gap-1 p-4">
            <h2 className="mb-1 text-sm font-bold">Resumen por etapa</h2>
            {p.stages.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStageId(s.id)}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50"
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="text-xs text-muted">{plural(s.openTasks, "tarea abierta", "tareas abiertas")}</span>
                <strong className="w-6 text-right">{s.count}</strong>
              </button>
            ))}
          </Card>

          <Card className="flex flex-col gap-2 p-4">
            <h2 className="text-sm font-bold">Movimientos de hoy</h2>
            {p.todayMoves.length === 0 ? (
              <p className="text-sm text-muted">Todavía nadie cambió de etapa hoy.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {p.todayMoves.map((m) => (
                  <li key={`${m.opportunityId}-${m.at}`} className="flex gap-3 text-sm">
                    <span className="w-11 shrink-0 text-xs font-semibold text-muted tabular-nums">{arParts(m.at).time}</span>
                    <span>
                      <strong>{m.clientName}</strong> pasó a <strong>{m.stageName}</strong>
                      {m.reason && <span className="text-muted"> · {m.actorName ? `${m.actorName}: ` : ""}{m.reason}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <StageDialog
        stage={stage}
        stages={p.stages}
        onClose={() => setStageId(null)}
        onNotice={notice.show}
        onWon={(msg, projectId) => {
          setStageId(null);
          setBanner({ msg, projectId });
        }}
      />
      <NewOpportunityDialog open={creating} onClose={() => setCreating(false)} onCreated={notice.show} />
      <Notice message={notice.message} />
    </>
  );
}

function StageDialog({
  stage,
  stages,
  onClose,
  onNotice,
  onWon,
}: {
  stage: PipelineStageDto | null;
  stages: PipelineStageDto[];
  onClose: () => void;
  onNotice: (msg: string) => void;
  onWon: (msg: string, projectId: string) => void;
}) {
  const opps = useStageOpportunities(stage?.id ?? null);
  const move = useMoveOpportunity();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [winning, setWinning] = useState<OpportunityCardDto | null>(null);
  const [losing, setLosing] = useState<OpportunityCardDto | null>(null);
  const closed = stage?.key === "implementacion";
  const movable = stages.filter((s) => s.key !== "implementacion");

  return (
    <>
      <Dialog
        open={!!stage}
        onClose={onClose}
        size="xl"
        title={stage ? `${stage.name} · ${plural(stage.count, "cliente", "clientes")} · ${money(stage.total)}` : ""}
        description={stage?.description ?? undefined}
      >
        {opps.error ? (
          <ErrorBox error={opps.error} onRetry={() => void opps.refetch()} />
        ) : opps.isPending ? (
          <Skeleton className="h-40" />
        ) : opps.data.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{closed ? "Nadie pasó a implementación este mes." : "Nadie en esta etapa."}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {opps.data.map((o) => (
              <OpportunityCard
                key={o.id}
                opp={o}
                closed={closed}
                movable={movable}
                onOpenTask={setTaskId}
                onWin={() => setWinning(o)}
                onLose={() => setLosing(o)}
                onMove={(to) =>
                  move.mutate(
                    { id: o.id, stageId: to },
                    { onSuccess: () => onNotice(`${o.client.name} pasó a ${stages.find((s) => s.id === to)?.name}.`) },
                  )
                }
              />
            ))}
          </div>
        )}
        {move.error && <p role="alert" className="mt-3 text-sm text-red-700">{move.error.message}</p>}
        {!closed && (
          <p className="mt-4 text-xs text-muted">
            Las tareas se trabajan desde Mi día: cuando cambiás su estado, el cliente avanza solo. «Mover» es para corregir a mano.
          </p>
        )}
      </Dialog>
      <TaskDialog taskId={taskId} onClose={() => setTaskId(null)} onSaved={onNotice} />
      <WinDialog opp={winning} onClose={() => setWinning(null)} onDone={onWon} />
      <LoseDialog opp={losing} onClose={() => setLosing(null)} onDone={onNotice} />
    </>
  );
}

function OpportunityCard({
  opp: o,
  closed,
  movable,
  onOpenTask,
  onWin,
  onLose,
  onMove,
}: {
  opp: OpportunityCardDto;
  closed: boolean;
  movable: PipelineStageDto[];
  onOpenTask: (id: string) => void;
  onWin: () => void;
  onLose: () => void;
  onMove: (stageId: string) => void;
}) {
  const t = o.nextTask;
  const overdue = !!t && t.status !== "hecha" && t.startsAt !== null && new Date(t.startsAt) < new Date();
  const stale = !closed && o.daysInStage >= STALE_DAYS;
  return (
    <article className="flex flex-col gap-2.5 rounded-xl border border-line p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/clientes/$clientId" params={{ clientId: o.client.id }} className="font-bold hover:underline">
            {o.client.name}
          </Link>
          <p className="text-sm text-muted">{o.title}</p>
        </div>
        <strong className="shrink-0">{money(o.amount)}</strong>
      </div>
      {o.contact && (
        <p className="flex items-center gap-1.5 text-xs text-slate-600">
          <User size={13} aria-hidden /> {o.contact.name}
          {o.contact.jobTitle && ` · ${o.contact.jobTitle}`}
        </p>
      )}
      {t ? (
        <button
          type="button"
          onClick={() => onOpenTask(t.id)}
          className="flex flex-col gap-0.5 rounded-[10px] px-3 py-2 text-left hover:brightness-95"
          style={{ background: tint(t.typeColor, t.status === "hecha"), boxShadow: `inset 4px 0 0 ${t.typeColor}` }}
        >
          <span className="flex items-center justify-between gap-2">
            <strong className={cn("truncate text-sm", t.status === "hecha" && "line-through")}>{t.title}</strong>
            <Chip tone={TASK_STATUS[t.status].tone} className="bg-white/70">
              {TASK_STATUS[t.status].label}
            </Chip>
          </span>
          <span className={cn("text-xs text-slate-600", overdue && "font-semibold text-red-700")}>
            {t.assigneeName} · {when(t.startsAt)}
            {overdue && " · vencida"}
          </span>
        </button>
      ) : (
        !closed && <p className="rounded-[10px] bg-amber-50 px-3 py-2 text-xs text-amber-900">Sin tareas: agendale el próximo paso.</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className={stale ? "font-semibold text-red-700" : "text-muted"}>
          {closed
            ? `Ganada ${when(o.stageEnteredAt, false)}`
            : o.daysInStage === 0
              ? "Entró hoy a la etapa"
              : `${plural(o.daysInStage, "día", "días")} en la etapa${stale ? " · sin movimiento" : ""}`}
          {o.owner && ` · ${o.owner.name}`}
        </span>
        {closed ? (
          o.projectId && (
            <Link to="/proyectos/$projectId" params={{ projectId: o.projectId }} className="font-semibold text-brand hover:underline">
              Ver proyecto →
            </Link>
          )
        ) : (
          <span className="flex flex-wrap items-center gap-1.5">
            <label className="sr-only" htmlFor={`move-${o.id}`}>
              Mover a otra etapa
            </label>
            <Select
              id={`move-${o.id}`}
              value=""
              onChange={(e) => e.target.value && onMove(e.target.value)}
              className="h-8 w-32 text-xs"
            >
              <option value="">Mover…</option>
              {movable.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="ghost" onClick={onLose}>
              Perdida
            </Button>
            <Button size="sm" onClick={onWin}>
              <Trophy size={13} aria-hidden /> Ganada
            </Button>
          </span>
        )}
      </div>
    </article>
  );
}
