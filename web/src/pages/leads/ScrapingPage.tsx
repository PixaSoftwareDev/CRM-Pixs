import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, RefreshCw, AlertCircle, CheckCircle, Clock, XCircle, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { useUIStore } from '../../stores/ui'
import { leadsApi, type ScrapingJob } from '../../lib/api/leads'

const RESULT_COUNT_OPTIONS = [5, 10, 20, 50]

const JOB_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  running: 'En proceso',
  completed: 'Completado',
  failed: 'Fallido',
}

function JobStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed': return <CheckCircle className="w-4 h-4 text-success" />
    case 'failed':    return <XCircle className="w-4 h-4 text-danger" />
    case 'running':   return <RefreshCw className="w-4 h-4 text-info animate-spin" />
    default:          return <Clock className="w-4 h-4 text-text-tertiary" />
  }
}

function JobTracker({ job: initial, onDelete }: { job: ScrapingJob; onDelete: (id: string) => void }) {
  const [job, setJob] = useState(initial)
  const isActive = job.status === 'pending' || job.status === 'running'

  useEffect(() => {
    if (!isActive) return
    const id = setInterval(async () => {
      try {
        const updated = await leadsApi.scraping.get(job.id)
        setJob(updated)
        if (updated.status !== 'pending' && updated.status !== 'running') clearInterval(id)
      } catch {
        clearInterval(id)
      }
    }, 2000)
    return () => clearInterval(id)
  }, [job.id, isActive])

  const total = job.result_count_requested || 1
  const pct = Math.min(100, Math.round((job.urls_processed / total) * 100))

  return (
    <div className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-sm text-text truncate max-w-xs">{job.query}</p>
          <p className="text-xs text-text-tertiary mt-0.5">
            {new Date(job.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <JobStatusIcon status={job.status} />
          <span className="text-xs font-medium text-text-secondary">{JOB_STATUS_LABELS[job.status] ?? job.status}</span>
          <button
            onClick={() => onDelete(job.id)}
            className="ml-1 rounded p-1 text-text-tertiary hover:text-danger hover:bg-danger/10 transition-colors"
            title="Eliminar del historial"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isActive && (
        <div>
          <div className="flex justify-between text-xs text-text-secondary mb-1">
            <span>{job.urls_processed} / {job.result_count_requested} sitios</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 bg-surface-raised rounded-full overflow-hidden">
            <div className="h-full bg-brand rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {job.status === 'completed' && (
        <p className="text-xs text-text-secondary">
          <span className="font-medium text-text">{job.leads_found}</span> leads encontrados de {job.urls_processed} sitios visitados
        </p>
      )}

      {job.status === 'failed' && job.error_summary && (
        <div className="flex items-start gap-2 rounded-lg bg-danger/10 border border-danger/30 p-3">
          <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
          <p className="text-xs text-danger">{job.error_summary}</p>
        </div>
      )}
    </div>
  )
}

export function ScrapingPage() {
  const toast = useUIStore((s) => s.toast)
  const qc = useQueryClient()
  const [query, setQuery] = useState('')
  const [resultCount, setResultCount] = useState(10)

  const { data: jobs, isLoading, isError, refetch } = useQuery({
    queryKey: ['scraping-jobs'],
    queryFn: leadsApi.scraping.list,
    refetchInterval: 5000,
  })

  const enqueue = useMutation({
    mutationFn: () =>
      leadsApi.scraping.enqueue({ query, result_count: resultCount }),
    onSuccess: () => {
      toast.success('Búsqueda iniciada...')
      setQuery('')
      qc.invalidateQueries({ queryKey: ['scraping-jobs'] })
    },
    onError: () => toast.error('No se pudo iniciar la búsqueda'),
  })

  const deleteJob = useMutation({
    mutationFn: (id: string) => leadsApi.scraping.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scraping-jobs'] }),
    onError: () => toast.error('No se pudo eliminar'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) {
      toast.error('Ingresá una búsqueda')
      return
    }
    enqueue.mutate()
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="text-2xl font-semibold text-text">Búsqueda de leads</h1>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <p className="text-base font-semibold text-text mb-1">¿Qué tipo de empresa buscás?</p>
        <p className="text-sm text-text-secondary mb-4">
          Escribí lo que buscás y el sistema va a encontrar sitios web, extraer emails, teléfonos y redes automáticamente.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ej: queserías Argentina, panaderías Buenos Aires..."
                className="w-full rounded-lg border border-border bg-surface-raised py-2.5 pl-9 pr-3 text-sm text-text placeholder:text-text-tertiary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <label className="text-sm text-text-secondary whitespace-nowrap">Resultados:</label>
              <select
                value={resultCount}
                onChange={(e) => setResultCount(Number(e.target.value))}
                className="rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-sm text-text focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              >
                {RESULT_COUNT_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={enqueue.isPending}
              disabled={!query.trim()}
            >
              <Search className="w-4 h-4" />
              Buscar
            </Button>
          </div>
        </form>
      </div>

      <div>
        <p className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
          Historial
        </p>
        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : isError ? (
          <ErrorState message="No se pudieron cargar los jobs." onRetry={() => refetch()} />
        ) : (jobs ?? []).length === 0 ? (
          <EmptyState title="Sin búsquedas todavía" description="Ingresá una búsqueda arriba para empezar." />
        ) : (
          <div className="flex flex-col gap-3">
            {(jobs ?? []).map((job) => (
              <JobTracker key={job.id} job={job} onDelete={(id) => deleteJob.mutate(id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
