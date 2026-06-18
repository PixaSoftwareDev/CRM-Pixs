import { useMemo, useState } from 'react'
import {
  Calendar,
  dateFnsLocalizer,
  Views,
  type View,
  type SlotInfo,
} from 'react-big-calendar'
import { format, parse, startOfWeek, getDay, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import './agenda.css'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { SlideOver } from '../../components/ui/SlideOver'
import { ErrorState } from '../../components/ui/ErrorState'
import { useAuthStore } from '../../stores/auth'
import { useUIStore } from '../../stores/ui'
import {
  calendarApi,
  type CalendarEvent,
  type CreateEventInput,
} from '../../lib/api/calendar'
import { eventStatusOptions } from '../../lib/crm'

const locales = { es }
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { locale: es }),
  getDay,
  locales,
})

const messages = {
  date: 'Fecha',
  time: 'Hora',
  event: 'Evento',
  allDay: 'Todo el día',
  week: 'Semana',
  work_week: 'Semana laboral',
  day: 'Día',
  month: 'Mes',
  previous: 'Anterior',
  next: 'Siguiente',
  yesterday: 'Ayer',
  tomorrow: 'Mañana',
  today: 'Hoy',
  agenda: 'Agenda',
  noEventsInRange: 'No hay eventos en este rango.',
  showMore: (total: number) => `+ ${total} más`,
}

interface RbcEvent {
  id: string
  title: string
  start: Date
  end: Date
  allDay: boolean
  resource: CalendarEvent
}

function toLocalInput(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function AgendaPage() {
  const can = useAuthStore((s) => s.can)
  const selfId = useAuthStore((s) => s.user?.user_id)
  const [view, setView] = useState<View>(Views.WEEK)
  const [date, setDate] = useState(new Date())
  const [range, setRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  })
  const [typeFilter, setTypeFilter] = useState('')
  const [editing, setEditing] = useState<CalendarEvent | null>(null)
  const [createSlot, setCreateSlot] = useState<{ start: Date; end: Date } | null>(null)

  const { data: types } = useQuery({
    queryKey: ['event-types'],
    queryFn: () => calendarApi.eventTypes(),
  })

  const { data: events, isError, refetch } = useQuery({
    queryKey: ['calendar-events', range.from.toISOString(), range.to.toISOString(), typeFilter],
    queryFn: () =>
      calendarApi.events({
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        type_id: typeFilter || undefined,
      }),
  })

  const typeColor = useMemo(() => {
    const m: Record<string, string> = {}
    types?.forEach((t) => (m[t.id] = t.color))
    return m
  }, [types])

  const rbcEvents: RbcEvent[] = useMemo(
    () =>
      (events ?? []).map((e) => ({
        id: e.id,
        title: e.title,
        start: new Date(e.starts_at),
        end: new Date(e.ends_at ?? e.starts_at),
        allDay: e.all_day,
        resource: e,
      })),
    [events],
  )

  const handleRangeChange = (r: Date[] | { start: Date; end: Date }) => {
    if (Array.isArray(r)) {
      setRange({ from: r[0], to: r[r.length - 1] })
    } else {
      setRange({ from: r.start, to: r.end })
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-text">Agenda</h1>
        {can('calendar', 'create') && (
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              const start = new Date()
              const end = new Date(start.getTime() + 60 * 60 * 1000)
              setCreateSlot({ start, end })
            }}
          >
            <Plus size={20} />
            Nuevo evento
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            options={[
              { value: '', label: 'Todos los tipos' },
              ...(types ?? []).map((t) => ({ value: t.id, label: t.name })),
            ]}
            aria-label="Filtrar por tipo de evento"
          />
        </div>
      </div>

      {isError ? (
        <ErrorState message="No pudimos cargar la agenda." onRetry={() => refetch()} />
      ) : (
        <div className="rbc-shell rounded-xl border border-border bg-surface p-2" style={{ height: 640 }}>
          <Calendar
            localizer={localizer}
            culture="es"
            messages={messages}
            events={rbcEvents}
            view={view}
            date={date}
            onView={setView}
            onNavigate={setDate}
            onRangeChange={handleRangeChange}
            views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
            startAccessor="start"
            endAccessor="end"
            selectable={can('calendar', 'create')}
            onSelectSlot={(slot: SlotInfo) =>
              setCreateSlot({ start: slot.start as Date, end: slot.end as Date })
            }
            onSelectEvent={(ev: RbcEvent) => setEditing(ev.resource)}
            eventPropGetter={(ev: RbcEvent) => {
              const color = ev.resource.event_type_id
                ? typeColor[ev.resource.event_type_id]
                : undefined
              return color ? { style: { backgroundColor: color, borderColor: color } } : {}
            }}
            formats={{
              timeGutterFormat: (d: Date) => format(d, 'HH:mm'),
              eventTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
                `${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`,
            }}
          />
        </div>
      )}

      {(createSlot || editing) && (
        <EventForm
          event={editing}
          slot={createSlot}
          selfId={selfId}
          types={types ?? []}
          onClose={() => {
            setCreateSlot(null)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function EventForm({
  event,
  slot,
  selfId,
  types,
  onClose,
}: {
  event: CalendarEvent | null
  slot: { start: Date; end: Date } | null
  selfId?: string
  types: { id: string; name: string }[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)
  const can = useAuthStore((s) => s.can)

  const [form, setForm] = useState<CreateEventInput>({
    title: event?.title ?? '',
    event_type_id: event?.event_type_id ?? '',
    contact_id: event?.contact_id ?? '',
    assigned_user_id: event?.assigned_user_id ?? selfId ?? '',
    starts_at: event ? event.starts_at : (slot?.start ?? new Date()).toISOString(),
    ends_at: event?.ends_at ?? slot?.end?.toISOString(),
    all_day: event?.all_day ?? false,
    status: event?.status ?? 'pending',
    notes: event?.notes ?? '',
  })

  const save = useMutation({
    mutationFn: (body: CreateEventInput) =>
      event ? calendarApi.update(event.id, body) : calendarApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar-events'] })
      toast.success(event ? 'Evento actualizado' : 'Evento creado')
      onClose()
    },
    onError: () => toast.error('No se pudo guardar el evento'),
  })

  const del = useMutation({
    mutationFn: () => calendarApi.delete(event!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar-events'] })
      toast.success('Evento eliminado')
      onClose()
    },
    onError: () => toast.error('No se pudo eliminar'),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.assigned_user_id) {
      toast.error('Completá el título')
      return
    }
    const body: CreateEventInput = {
      ...form,
      event_type_id: form.event_type_id || undefined,
      contact_id: form.contact_id || undefined,
      ends_at: form.ends_at || undefined,
    }
    save.mutate(body)
  }

  return (
    <SlideOver open onClose={onClose} title={event ? 'Editar evento' : 'Nuevo evento'}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Input label="Título" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <Select
          label="Tipo de evento"
          placeholder="Sin tipo"
          value={form.event_type_id ?? ''}
          onChange={(e) => setForm({ ...form, event_type_id: e.target.value })}
          options={types.map((t) => ({ value: t.id, label: t.name }))}
        />
        <Input
          label="Comienza"
          type="datetime-local"
          value={toLocalInput(form.starts_at)}
          onChange={(e) => setForm({ ...form, starts_at: new Date(e.target.value).toISOString() })}
        />
        <Input
          label="Termina"
          type="datetime-local"
          value={toLocalInput(form.ends_at)}
          onChange={(e) =>
            setForm({ ...form, ends_at: e.target.value ? new Date(e.target.value).toISOString() : undefined })
          }
        />
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={form.all_day}
            onChange={(e) => setForm({ ...form, all_day: e.target.checked })}
            className="h-4 w-4 rounded border-border accent-brand"
          />
          Todo el día
        </label>
        <Select
          label="Estado"
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value })}
          options={eventStatusOptions}
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text">Notas</label>
          <textarea
            value={form.notes ?? ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={3}
            className="w-full rounded border border-border bg-surface p-3 text-base text-text focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          {event && can('calendar', 'delete') ? (
            <Button type="button" variant="ghost" size="md" onClick={() => del.mutate()} loading={del.isPending}>
              Eliminar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-3">
            <Button type="button" variant="secondary" size="md" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="md" loading={save.isPending}>
              Guardar
            </Button>
          </div>
        </div>
      </form>
    </SlideOver>
  )
}
