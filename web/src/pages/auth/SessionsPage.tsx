import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Monitor, ShieldOff } from 'lucide-react'
import { authApi, type Session } from '../../lib/api/auth'
import { useUIStore } from '../../stores/ui'
import { Button } from '../../components/ui/Button'
import { ConfirmModal } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui/EmptyState'
import { SkeletonRow } from '../../components/ui/Skeleton'
import { formatRelativeTime } from '../../lib/utils'

export function SessionsPage() {
  const queryClient = useQueryClient()
  const toast = useUIStore((s) => s.toast)
  const [toRevoke, setToRevoke] = useState<Session | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['sessions'],
    queryFn: authApi.sessions,
  })

  const revoke = useMutation({
    mutationFn: (id: string) => authApi.revokeSession(id),
    onSuccess: () => {
      toast.success('Sesión revocada')
      setToRevoke(null)
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
    onError: () => toast.error('No pudimos revocar la sesión'),
  })

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">Sesiones activas</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Estos son los dispositivos donde iniciaste sesión.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface">
        {isLoading && (
          <div className="p-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-text-secondary">No pudimos cargar las sesiones.</p>
            <Button variant="secondary" size="md" onClick={() => refetch()}>
              Reintentar
            </Button>
          </div>
        )}

        {data && data.length === 0 && (
          <EmptyState
            icon={<Monitor size={28} />}
            title="No hay sesiones activas"
            description="Cuando inicies sesión en un dispositivo, aparecerá acá."
          />
        )}

        {data &&
          data.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-4 border-b border-border p-4 last:border-0"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-raised text-text-tertiary">
                <Monitor size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">{s.ip_address}</p>
                <p className="truncate text-xs text-text-tertiary">{s.user_agent}</p>
                <p className="mt-0.5 text-xs text-text-secondary">
                  Última actividad: {formatRelativeTime(s.last_seen_at)}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setToRevoke(s)}>
                <ShieldOff size={16} />
                Revocar
              </Button>
            </div>
          ))}
      </div>

      <ConfirmModal
        open={!!toRevoke}
        onClose={() => setToRevoke(null)}
        onConfirm={() => toRevoke && revoke.mutate(toRevoke.id)}
        title="Revocar sesión"
        description={`Revocar la sesión de ${toRevoke?.ip_address ?? ''}. El dispositivo deberá iniciar sesión de nuevo.`}
        confirmLabel="Revocar"
        loading={revoke.isPending}
      />
    </div>
  )
}
