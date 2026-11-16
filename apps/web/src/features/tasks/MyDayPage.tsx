import type { TaskDto } from "@crm/shared";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Chip } from "../../components/ui/Chip";
import { cn } from "../../components/ui/cn";
import { CheckOption, Dropdown } from "../../components/ui/Dropdown";
import { Input, Select } from "../../components/ui/Field";
import { Notice, useNotice } from "../../components/ui/Notice";
import { ErrorBox, Skeleton } from "../../components/ui/States";
import { myDayRoute } from "../../router";
import { useClientOptions, useMyId, useTasksInRange, useTeam, useUnscheduledTasks } from "./api";
import { TASK_STATUS, tint } from "./labels";
import { parseQuickTask } from "./quick-parse";
import { TaskDialog } from "./TaskDialog";
import { type TaskDraft, TaskFormDialog } from "./TaskFormDialog";
import { addDays, arParts, dayTitle, nextSlot, nowMinutesAr, toHHMM, todayAr } from "./time";
import { useTitle } from "../../hooks/useTitle";

// El día entero: con un rango fijo, lo agendado fuera de él se veía en otra hora.
const FIRST_HOUR = 0;
const LAST_HOUR = 23;
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i);
/** Hora que queda arriba al abrir (si no es hoy). */
const SCROLL_TO_HOUR = 8;

const isOpen = (t: TaskDto) => t.status !== "hecha";
const startOf = (t: TaskDto) => (t.startsAt ? arParts(t.startsAt) : null);

/** Quita/agrega una clave de un set inmutable. */
const toggle = (set: ReadonlySet<string>, key: string) => {
  const next = new Set(set);
  if (!next.delete(key)) next.add(key);
  return next;
};

export function MyDayPage() {
  useTitle("Mi día");
  const search = myDayRoute.useSearch();
  const navigate = useNavigate({ from: myDayRoute.fullPath });
  const me = useMyId();
  const date = search.date ?? todayAr();
  const userId = search.user ?? me;

  const tasks = useTasksInRange(date, date);
  const unscheduled = useUnscheduledTasks();
  const team = useTeam();
  const clients = useClientOptions();
  const notice = useNotice();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [hiddenTypes, setHiddenTypes] = useState<ReadonlySet<string>>(new Set());
  const [hiddenClients, setHiddenClients] = useState<ReadonlySet<string>>(new Set());

  const go = (patch: { date?: string | undefined; user?: string | undefined }) =>
    void navigate({ search: (s) => ({ ...s, ...patch }), replace: true });

  const all = tasks.data ?? [];
  const mine = useMemo(() => all.filter((t) => t.assignee.id === userId), [all, userId]);
  const visible = mine.filter((t) => !hiddenTypes.has(t.type.id) && !hiddenClients.has(t.client?.id ?? ""));

  // Opciones de los filtros: solo lo que aparece hoy en esta agenda.
  const typeOptions = unique(mine.map((t) => ({ key: t.type.id, label: t.type.name, color: t.type.color })));
  const clientOptions = unique(mine.map((t) => ({ key: t.client?.id ?? "", label: t.client?.name ?? "Sin cliente" })));
  // Solo cuentan los ocultos que existen en este día (al cambiar de día quedan claves viejas).
  const hiddenT = typeOptions.filter((o) => hiddenTypes.has(o.key)).length;
  const hiddenC = clientOptions.filter((o) => hiddenClients.has(o.key)).length;
  const filtered = hiddenT + hiddenC > 0;

  const byHour = new Map<number, TaskDto[]>();
  for (const t of visible) {
    const h = Math.min(LAST_HOUR, Math.max(FIRST_HOUR, Math.floor((startOf(t)?.minutes ?? 0) / 60)));
    byHour.set(h, [...(byHour.get(h) ?? []), t]);
  }

  const isToday = date === todayAr();
  const undated = (unscheduled.data ?? []).filter((t) => t.assignee.id === userId);
  const nowHour = isToday ? Math.floor(nowMinutesAr() / 60) : -1;
  const viewingOther = userId !== me;

  const quickAdd = () => {
    if (!text.trim()) return;
    const { warning, ...d } = parseQuickTask(text, {
      clients: clients.data ?? [],
      baseDate: date,
      defaultStart: isToday ? nextSlot() : "10:00",
    });
    if (warning) notice.show(warning);
    setDraft({ ...d, assigneeId: userId });
  };

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" aria-label="Día anterior" onClick={() => go({ date: addDays(date, -1) })}>
            <ChevronLeft size={16} aria-hidden />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => go({ date: undefined })} disabled={isToday}>
            Hoy
          </Button>
          <Button variant="secondary" size="sm" aria-label="Día siguiente" onClick={() => go({ date: addDays(date, 1) })}>
            <ChevronRight size={16} aria-hidden />
          </Button>
          <h1 className="ml-2 text-[26px] font-bold tracking-tight">{dayTitle(date)}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="indigo">{mine.filter(isOpen).length} por hacer</Chip>
          <Chip tone="green">{mine.filter((t) => !isOpen(t)).length} hechas</Chip>
          <label className="flex items-center gap-2 text-sm whitespace-nowrap text-muted">
            Agenda de
            <Select
              value={userId}
              onChange={(e) => go({ user: e.target.value === me ? undefined : e.target.value })}
              className="h-9 w-auto"
            >
              {team.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.id === me ? "Yo" : u.name} ({all.filter((t) => t.assignee.id === u.id && isOpen(t)).length})
                </option>
              ))}
            </Select>
          </label>
        </div>
      </header>

      <Card className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
        <Sparkles size={18} aria-hidden className="ml-1 hidden shrink-0 text-brand sm:block" />
        <label className="min-w-0 flex-1">
          <span className="sr-only">Nueva tarea</span>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), quickAdd())}
            placeholder="Escribí la tarea… ej: llamar a La Espiga mañana 10hs por la cuota (Enter para agendar)"
            className="border-transparent bg-slate-50"
          />
        </label>
        <Button onClick={quickAdd} disabled={!text.trim()}>
          Agendar
        </Button>
      </Card>

      {mine.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Dropdown label={<>Tipos: <strong>{summary(typeOptions.length, hiddenT)}</strong></>}>
            {typeOptions.map((o) => (
              <CheckOption
                key={o.key}
                label={o.label}
                color={o.color}
                count={mine.filter((t) => t.type.id === o.key).length}
                checked={!hiddenTypes.has(o.key)}
                onChange={() => setHiddenTypes((s) => toggle(s, o.key))}
              />
            ))}
            <AllNone onAll={() => setHiddenTypes(new Set())} onNone={() => setHiddenTypes(new Set(typeOptions.map((o) => o.key)))} />
          </Dropdown>
          <Dropdown label={<>Clientes: <strong>{summary(clientOptions.length, hiddenC)}</strong></>}>
            {clientOptions.map((o) => (
              <CheckOption
                key={o.key}
                label={o.label}
                count={mine.filter((t) => (t.client?.id ?? "") === o.key).length}
                checked={!hiddenClients.has(o.key)}
                onChange={() => setHiddenClients((s) => toggle(s, o.key))}
              />
            ))}
            <AllNone
              onAll={() => setHiddenClients(new Set())}
              onNone={() => setHiddenClients(new Set(clientOptions.map((o) => o.key)))}
            />
          </Dropdown>
          {filtered && (
            <Button variant="ghost" size="sm" onClick={() => (setHiddenTypes(new Set()), setHiddenClients(new Set()))}>
              Quitar filtros
            </Button>
          )}
        </div>
      )}

      {tasks.error ? (
        <ErrorBox error={tasks.error} onRetry={() => void tasks.refetch()} />
      ) : tasks.isPending ? (
        <Skeleton className="h-96" />
      ) : (
        <Card
          key={date}
          ref={(el: HTMLDivElement | null) => {
            // Al abrir el día arranca en las 08 (hoy: una hora antes de ahora); el resto queda a un scroll.
            if (el && !el.dataset.scrolled) {
              const hour = isToday ? Math.max(0, nowHour - 1) : SCROLL_TO_HOUR;
              const row = el.querySelector<HTMLElement>(`[data-hour="${hour}"]`);
              if (row) el.scrollTop = row.getBoundingClientRect().top - el.getBoundingClientRect().top;
              el.dataset.scrolled = "1";
            }
          }}
          className={cn("max-h-[70vh] divide-y divide-slate-100 overflow-y-auto", tasks.isPlaceholderData && "opacity-60")}
        >
          {HOURS.map((h) => {
            const rows = byHour.get(h) ?? [];
            const label = `${String(h).padStart(2, "0")}:00`;
            return (
              <div key={h} data-hour={h} className="relative flex gap-3 px-3 py-2 sm:gap-4 sm:px-4">
                <span className="w-12 shrink-0 pt-1.5 text-xs font-semibold text-muted tabular-nums">{label}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {rows.map((t) => (
                    <TaskRow key={t.id} task={t} viewerId={userId} onOpen={() => setOpenId(t.id)} />
                  ))}
                  <button
                    type="button"
                    onClick={() => setDraft({ date, start: label, assigneeId: userId })}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2 text-left text-xs text-slate-400 hover:bg-slate-50 hover:text-brand",
                      rows.length ? "h-6" : "h-8",
                    )}
                  >
                    <Plus size={12} aria-hidden />
                    {rows.length ? `otra a las ${label.slice(0, 2)} hs` : "Libre · tocá para agendar"}
                  </button>
                </div>
                {h === nowHour && (
                  <span className="pointer-events-none absolute inset-x-0 top-0 flex items-center" aria-label="Ahora">
                    <span className="h-0.5 flex-1 bg-red-500" />
                    <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">ahora</span>
                  </span>
                )}
              </div>
            );
          })}
          {visible.length === 0 && (
            <p className="px-4 py-3 text-center text-sm text-muted">
              {filtered
                ? "Los filtros ocultan todas las tareas del día."
                : viewingOther
                  ? "No tiene nada agendado este día."
                  : "No hay nada agendado este día."}
            </p>
          )}
        </Card>
      )}

      {isToday && undated.length > 0 && (
        <Card className="flex flex-col gap-1.5 p-3 sm:p-4">
          <h2 className="text-sm font-bold">
            Sin fecha <span className="font-normal text-muted">· {undated.length} por agendar</span>
          </h2>
          {undated.map((t) => (
            <TaskRow key={t.id} task={t} viewerId={userId} onOpen={() => setOpenId(t.id)} />
          ))}
        </Card>
      )}

      <TaskFormDialog
        draft={draft}
        onClose={() => setDraft(null)}
        onCreated={(m) => {
          setText("");
          notice.show(m);
        }}
      />
      <TaskDialog taskId={openId} onClose={() => setOpenId(null)} onSaved={notice.show} />
      <Notice message={notice.message} />
    </>
  );
}

function TaskRow({ task: t, viewerId, onOpen }: { task: TaskDto; viewerId: string; onOpen: () => void }) {
  const p = startOf(t);
  const done = t.status === "hecha";
  const from = t.assignedBy && t.assignedBy.id !== viewerId ? t.assignedBy.name : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn("flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] px-3 py-2 text-left transition hover:brightness-95", done && "opacity-70")}
      style={{ background: tint(t.type.color, done), boxShadow: `inset 4px 0 0 ${t.type.color}` }}
    >
      <span className="text-xs font-semibold text-slate-600 tabular-nums">
        {p ? `${p.time}–${toHHMM(p.minutes + t.durationMinutes)}` : "—"}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">
        <strong className={cn(done && "text-slate-500 line-through")}>
          {done && "✓ "}
          {t.title}
        </strong>
        {t.client && <span className="text-slate-600"> · {t.client.name}</span>}
      </span>
      <span className="flex items-center gap-1.5">
        {from && <Chip tone="amber">de {from}</Chip>}
        <Chip tone={TASK_STATUS[t.status].tone} className="bg-white/70">
          {TASK_STATUS[t.status].label}
        </Chip>
      </span>
    </button>
  );
}

function AllNone({ onAll, onNone }: { onAll: () => void; onNone: () => void }) {
  return (
    <div className="mt-1 flex justify-between border-t border-line px-1 pt-2">
      <Button variant="ghost" size="sm" onClick={onAll}>
        Marcar todos
      </Button>
      <Button variant="ghost" size="sm" onClick={onNone}>
        Ninguno
      </Button>
    </div>
  );
}

const summary = (total: number, hidden: number) => (hidden === 0 ? "Todos" : `${total - hidden} de ${total}`);

function unique<T extends { key: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const i of items) if (!seen.has(i.key)) seen.set(i.key, i);
  return [...seen.values()];
}
