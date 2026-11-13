import type { TaskDto } from "@crm/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "../../components/layout/AppLayout";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { cn } from "../../components/ui/cn";
import { Input, Select } from "../../components/ui/Field";
import { Notice, useNotice } from "../../components/ui/Notice";
import { ErrorBox, Skeleton } from "../../components/ui/States";
import { initials } from "../../lib/format";
import { agendaRoute } from "../../router";
import { useCreateTaskType, useDeleteTaskType, useMyId, useTasksInRange, useTaskTypes, useTeam } from "./api";
import { TYPE_PALETTE, tint } from "./labels";
import { layoutLanes } from "./lanes";
import { TaskDialog } from "./TaskDialog";
import { type TaskDraft, TaskFormDialog } from "./TaskFormDialog";
import { addDays, addMonths, arParts, dayTitle, monthGrid, monthTitle, todayAr, toHHMM, weekday, weekStart, weekTitle } from "./time";

const FIRST_HOUR = 8;
const LAST_HOUR = 20;
const ROW = 56; // px por hora
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i);
const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const ALL = "todos";

interface Placed {
  task: TaskDto;
  start: number;
  end: number;
}

export function AgendaPage() {
  const search = agendaRoute.useSearch();
  const navigate = useNavigate({ from: agendaRoute.fullPath });
  const me = useMyId();
  const today = todayAr();
  const selected = search.date ?? today;
  const userId = search.user ?? me;
  const monday = weekStart(selected);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const tasks = useTasksInRange(monday, days[6] ?? monday);
  const types = useTaskTypes();
  const team = useTeam();
  const notice = useNotice();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const go = (patch: { date?: string | undefined; user?: string | undefined }) =>
    void navigate({ search: (s) => ({ ...s, ...patch }), replace: true });

  const ofUser = useMemo(
    () => (tasks.data ?? []).filter((t) => userId === ALL || t.assignee.id === userId),
    [tasks.data, userId],
  );
  const visible = ofUser.filter((t) => !hidden.has(t.type.id));

  const byDay = useMemo(() => {
    const map = new Map<string, Placed[]>();
    for (const t of visible) {
      if (!t.startsAt) continue;
      const p = arParts(t.startsAt);
      map.set(p.date, [...(map.get(p.date) ?? []), { task: t, start: p.minutes, end: p.minutes + t.durationMinutes }]);
    }
    return map;
  }, [visible]);

  const newAt = (date: string, start: string) =>
    setDraft({ date, start, durationMinutes: 60, assigneeId: userId === ALL ? me : userId });

  return (
    <>
      <PageHeader
        title="Agenda"
        subtitle="Reuniones, llamadas y todo lo que hay que hacer con cada cliente"
        actions={
          <>
            <label className="flex items-center gap-2 text-sm whitespace-nowrap text-muted">
              Agenda de
              <Select
                value={userId}
                onChange={(e) => go({ user: e.target.value === me ? undefined : e.target.value })}
                className="h-[38px] w-auto"
              >
                <option value={ALL}>Todo el equipo ({count(tasks.data, null)})</option>
                {team.data?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.id === me ? "Yo" : u.name} ({count(tasks.data, u.id)})
                  </option>
                ))}
              </Select>
            </label>
            <Button onClick={() => newAt(selected, "10:00")}>
              <Plus size={16} aria-hidden /> Nuevo evento
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" aria-label="Semana anterior" onClick={() => go({ date: addDays(selected, -7) })}>
          <ChevronLeft size={16} aria-hidden />
        </Button>
        <Button variant="secondary" size="sm" onClick={() => go({ date: undefined })} disabled={selected === today}>
          Hoy
        </Button>
        <Button variant="secondary" size="sm" aria-label="Semana siguiente" onClick={() => go({ date: addDays(selected, 7) })}>
          <ChevronRight size={16} aria-hidden />
        </Button>
        <span className="ml-1 font-semibold">{weekTitle(monday)}</span>
      </div>

      <div className="grid gap-[18px] lg:grid-cols-[236px_1fr]">
        <aside className="flex flex-col gap-[18px]">
          <MiniMonth selected={selected} today={today} onPick={(d) => go({ date: d === today ? undefined : d })} />
          <TypesPanel
            hidden={hidden}
            onToggle={(id) =>
              setHidden((s) => {
                const n = new Set(s);
                if (!n.delete(id)) n.add(id);
                return n;
              })
            }
            weekCount={(id) => ofUser.filter((t) => t.type.id === id).length}
            types={types.data ?? []}
            onNotice={notice.show}
          />
        </aside>

        <div className="flex min-w-0 flex-col gap-[18px]">
          {tasks.error ? (
            <ErrorBox error={tasks.error} onRetry={() => void tasks.refetch()} />
          ) : tasks.isPending ? (
            <Skeleton className="h-[600px]" />
          ) : (
            <Card className={cn("overflow-x-auto", tasks.isPlaceholderData && "opacity-60")}>
              <div className="min-w-[680px]">
                <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-line">
                  <span />
                  {days.map((d, i) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => go({ date: d === today ? undefined : d })}
                      aria-pressed={d === selected}
                      className="flex flex-col items-center gap-0.5 py-2 hover:bg-slate-50"
                    >
                      <span className="text-xs text-muted">{DOW[i]}</span>
                      <span
                        className={cn(
                          "flex size-8 items-center justify-center rounded-full text-sm font-semibold",
                          d === selected ? "bg-brand text-white" : d === today && "text-brand",
                        )}
                      >
                        {Number(d.slice(8))}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-[52px_repeat(7,1fr)]">
                  <div className="relative">
                    {HOURS.map((h) => (
                      <span key={h} className="block pr-2 text-right text-[11px] text-muted tabular-nums" style={{ height: ROW }}>
                        {String(h).padStart(2, "0")}:00
                      </span>
                    ))}
                  </div>
                  {days.map((d) => (
                    <DayColumn
                      key={d}
                      date={d}
                      items={byDay.get(d) ?? []}
                      showOwner={userId === ALL}
                      isToday={d === today}
                      onSlot={(h) => newAt(d, `${String(h).padStart(2, "0")}:00`)}
                      onOpen={setOpenId}
                    />
                  ))}
                </div>
              </div>
            </Card>
          )}

          <DayList date={selected} items={[...(byDay.get(selected) ?? [])].sort((a, b) => a.start - b.start)} onOpen={setOpenId} />
        </div>
      </div>

      <TaskFormDialog draft={draft} onClose={() => setDraft(null)} onCreated={notice.show} title="Nuevo evento" />
      <TaskDialog taskId={openId} onClose={() => setOpenId(null)} onSaved={notice.show} />
      <Notice message={notice.message} />
    </>
  );
}

/** Pendientes de la semana de una persona (null = de todos). */
const count = (tasks: TaskDto[] | undefined, userId: string | null) =>
  (tasks ?? []).filter((t) => t.status !== "hecha" && (userId === null || t.assignee.id === userId)).length;

function DayColumn({
  date,
  items,
  showOwner,
  isToday,
  onSlot,
  onOpen,
}: {
  date: string;
  items: Placed[];
  showOwner: boolean;
  isToday: boolean;
  onSlot: (hour: number) => void;
  onOpen: (id: string) => void;
}) {
  const placed = layoutLanes(items);
  return (
    <div className={cn("relative border-l border-line", isToday && "bg-indigo-50/40")} style={{ height: HOURS.length * ROW }}>
      {HOURS.map((h) => (
        <button
          key={h}
          type="button"
          onClick={() => onSlot(h)}
          aria-label={`Agendar el ${dayTitle(date)} a las ${h}:00`}
          className="block w-full border-b border-slate-100 hover:bg-indigo-50"
          style={{ height: ROW }}
        />
      ))}
      {placed.map(({ item: { task: t, start, end }, lane, lanes }) => {
        const top = Math.max(0, ((start - FIRST_HOUR * 60) / 60) * ROW) + 1;
        const height = Math.max(22, ((end - start) / 60) * ROW - 3);
        const compact = height < 46;
        const done = t.status === "hecha";
        const range = `${toHHMM(start)} – ${toHHMM(end)}`;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onOpen(t.id)}
            title={`${t.title} — ${range}${t.client ? ` · ${t.client.name}` : ""} · ${t.assignee.name}`}
            className={cn(
              "absolute flex flex-col overflow-hidden rounded-lg px-2 py-1 text-left text-xs leading-tight transition hover:z-10 hover:shadow-md",
              compact ? "justify-center" : "justify-start",
              done && "opacity-60",
            )}
            style={{
              top,
              height,
              left: `calc(${(lane * 100) / lanes}% + 3px)`,
              width: `calc(${100 / lanes}% - 6px)`,
              background: tint(t.type.color, done),
              boxShadow: `inset 3px 0 0 ${t.type.color}`,
              paddingRight: showOwner ? 22 : undefined,
            }}
          >
            {compact ? (
              <span className="truncate">
                <span className="text-slate-600">{toHHMM(start)}</span> <strong className={cn(done && "line-through")}>{t.title}</strong>
              </span>
            ) : (
              <>
                <strong className={cn("truncate", done && "line-through")}>{t.title}</strong>
                <span className="truncate text-slate-600">
                  {range}
                  {height < 68 && t.client ? ` · ${t.client.name}` : ""}
                </span>
                {height >= 68 && t.client && <span className="truncate text-slate-600">{t.client.name}</span>}
              </>
            )}
            {showOwner && (
              <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-white text-[8px] font-bold text-slate-700">
                {initials(t.assignee.name)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function DayList({ date, items, onOpen }: { date: string; items: Placed[]; onOpen: (id: string) => void }) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="font-bold">{dayTitle(date)}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted">No hay eventos de los tipos seleccionados este día.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100">
          {items.map(({ task: t, start, end }) => (
            <li key={t.id} className="flex items-center gap-3 py-2.5">
              <span className="w-24 shrink-0 text-xs font-semibold text-slate-600 tabular-nums">
                {toHHMM(start)} – {toHHMM(end)}
              </span>
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: t.type.color }} aria-hidden />
              <button type="button" onClick={() => onOpen(t.id)} className="min-w-0 flex-1 text-left">
                <span className={cn("block truncate text-sm font-medium hover:underline", t.status === "hecha" && "line-through")}>
                  {t.title}
                </span>
                <span className="block text-xs text-muted">
                  {t.type.name} · {t.assignee.name}
                </span>
              </button>
              {t.client && (
                <Link
                  to="/clientes/$clientId"
                  params={{ clientId: t.client.id }}
                  className="hidden shrink-0 text-sm font-medium text-brand hover:underline sm:block"
                >
                  {t.client.name} →
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function MiniMonth({ selected, today, onPick }: { selected: string; today: string; onPick: (d: string) => void }) {
  // El mes que se mira puede no ser el del día elegido (se navega sin elegir).
  const [month, setMonth] = useState(selected.slice(0, 7));
  const [lastSelected, setLastSelected] = useState(selected);
  if (selected !== lastSelected) {
    setLastSelected(selected);
    setMonth(selected.slice(0, 7));
  }
  const base = `${month}-01`;
  const week = weekStart(selected);

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold">{monthTitle(base)}</h2>
        <div className="flex">
          <Button variant="ghost" size="sm" aria-label="Mes anterior" onClick={() => setMonth(addMonths(base, -1).slice(0, 7))}>
            <ChevronLeft size={14} aria-hidden />
          </Button>
          <Button variant="ghost" size="sm" aria-label="Mes siguiente" onClick={() => setMonth(addMonths(base, 1).slice(0, 7))}>
            <ChevronRight size={14} aria-hidden />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
          <span key={i} className="py-1 font-semibold text-muted" aria-hidden>
            {d}
          </span>
        ))}
        {monthGrid(base).map((d) => {
          const inWeek = d >= week && d <= addDays(week, 6);
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              aria-label={dayTitle(d)}
              aria-pressed={d === selected}
              className={cn(
                "flex h-8 items-center justify-center rounded-lg tabular-nums hover:bg-slate-100",
                d.slice(0, 7) !== month && "text-slate-300",
                inWeek && "bg-indigo-50",
                d === today && "font-bold text-brand",
                d === selected && "bg-brand font-semibold text-white hover:bg-brand-hover",
                weekday(d) === 0 && d !== selected && "text-slate-400",
              )}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function TypesPanel({
  types,
  hidden,
  onToggle,
  weekCount,
  onNotice,
}: {
  types: { id: string; name: string; color: string; isSystem: boolean; inUse: number }[];
  hidden: ReadonlySet<string>;
  onToggle: (id: string) => void;
  weekCount: (id: string) => number;
  onNotice: (m: string) => void;
}) {
  const create = useCreateTaskType();
  const remove = useDeleteTaskType();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(TYPE_PALETTE[1] ?? "#0891b2");

  const add = async () => {
    if (!name.trim()) return;
    await create.mutateAsync({ name: name.trim(), color });
    onNotice(`Tipo "${name.trim()}" agregado.`);
    setName("");
    setAdding(false);
  };

  const error = create.error ?? remove.error;

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">Tipos de evento</h2>
        <Button variant="ghost" size="sm" aria-label="Nuevo tipo" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>
          <Plus size={14} aria-hidden />
        </Button>
      </div>
      <ul className="flex flex-col gap-0.5">
        {types.map((t) => {
          const on = !hidden.has(t.id);
          const removable = !t.isSystem && t.inUse === 0;
          return (
            <li key={t.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onToggle(t.id)}
                aria-pressed={on}
                className={cn("flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50", !on && "text-slate-400 line-through")}
              >
                <span
                  className="size-3 shrink-0 rounded-[4px] border-2"
                  style={{ borderColor: t.color, background: on ? t.color : "transparent" }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <span className="text-xs text-muted">{weekCount(t.id)}</span>
              </button>
              {removable && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Eliminar el tipo ${t.name}`}
                  onClick={() => remove.mutate(t.id, { onSuccess: () => onNotice(`Tipo "${t.name}" eliminado.`) })}
                >
                  <X size={14} aria-hidden />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {adding && (
        <form
          className="flex flex-col gap-2 border-t border-line pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Nombre del tipo
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Soporte" maxLength={40} />
          </label>
          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs font-medium text-muted">Color</legend>
            <div className="flex flex-wrap gap-1.5">
              {TYPE_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                  aria-pressed={c === color}
                  className={cn("size-7 rounded-full ring-offset-2", c === color && "ring-2 ring-slate-900")}
                  style={{ background: c }}
                />
              ))}
            </div>
          </fieldset>
          <Button type="submit" size="sm" disabled={!name.trim() || create.isPending}>
            Agregar tipo
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error.message}
        </p>
      )}
    </Card>
  );
}
