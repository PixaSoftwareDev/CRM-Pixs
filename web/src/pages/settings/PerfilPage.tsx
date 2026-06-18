import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ShieldCheck, ShieldOff, KeyRound, Monitor } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { ConfirmModal } from '../../components/ui/Modal'
import { Skeleton } from '../../components/ui/Skeleton'
import { useUIStore } from '../../stores/ui'
import { useAuthStore } from '../../stores/auth'
import { authApi, type Session } from '../../lib/api/auth'

// ─── Password change form ──────────────────────────────────────────────────────

const pwdSchema = z.object({
  current_password: z.string().min(1, 'Requerido'),
  new_password: z.string().min(8, 'Mínimo 8 caracteres'),
  confirm_password: z.string().min(1, 'Requerido'),
}).refine((d) => d.new_password === d.confirm_password, {
  message: 'Las contraseñas no coinciden',
  path: ['confirm_password'],
})
type PwdValues = z.infer<typeof pwdSchema>

function PasswordSection() {
  const toast = useUIStore((s) => s.toast)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PwdValues>({
    resolver: zodResolver(pwdSchema),
  })

  const change = useMutation({
    mutationFn: (data: PwdValues) =>
      authApi.changePassword(data.current_password, data.new_password),
    onSuccess: () => { toast.success('Contraseña actualizada'); reset() },
    onError: (err: unknown) =>
      toast.error((err as { message?: string })?.message ?? 'Contraseña actual incorrecta'),
  })

  return (
    <div className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-text-secondary" />
        <p className="font-semibold text-text text-sm">Cambiar contraseña</p>
      </div>
      <form onSubmit={handleSubmit((d) => change.mutate(d))} className="flex flex-col gap-3">
        <Input label="Contraseña actual *" type="password" {...register('current_password')} error={errors.current_password?.message} />
        <Input label="Nueva contraseña *" type="password" {...register('new_password')} error={errors.new_password?.message} />
        <Input label="Confirmar nueva contraseña *" type="password" {...register('confirm_password')} error={errors.confirm_password?.message} />
        <Button type="submit" variant="primary" size="md" className="self-start" loading={change.isPending}>
          Actualizar contraseña
        </Button>
      </form>
    </div>
  )
}

// ─── 2FA section ───────────────────────────────────────────────────────────────

function TwoFASection() {
  const toast = useUIStore((s) => s.toast)
  const [step, setStep] = useState<'idle' | 'setup' | 'disable'>('idle')
  const [uri, setUri] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [disableCode, setDisableCode] = useState('')

  // We track 2FA enabled state optimistically from user object or via a query;
  // backend /auth/me doesn't expose totp_enabled, so we use local state seeded by a query.
  const { data: me2fa, refetch: refetchMe } = useQuery({
    queryKey: ['me-2fa'],
    queryFn: authApi.me,
    staleTime: 60_000,
  })

  const hasTOTP = (me2fa as unknown as { totp_enabled?: boolean })?.totp_enabled === true

  const enable = useMutation({
    mutationFn: authApi.enable2fa,
    onSuccess: (data) => { setUri(data.uri); setStep('setup') },
    onError: () => toast.error('No se pudo iniciar el proceso 2FA'),
  })

  const verify = useMutation({
    mutationFn: () => authApi.verify2fa(totpCode, []),
    onSuccess: () => {
      toast.success('2FA activado correctamente')
      setStep('idle')
      refetchMe()
    },
    onError: () => toast.error('Código incorrecto'),
  })

  const disable = useMutation({
    mutationFn: () => authApi.disable2fa(disableCode),
    onSuccess: () => {
      toast.success('2FA desactivado')
      setStep('idle')
      setDisableCode('')
      refetchMe()
    },
    onError: () => toast.error('Código incorrecto'),
  })

  return (
    <div className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-text-secondary" />
        <p className="font-semibold text-text text-sm">Autenticación en dos pasos (2FA)</p>
        {hasTOTP ? (
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/30">Activo</span>
        ) : (
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-surface-raised text-text-tertiary border border-border">Inactivo</span>
        )}
      </div>

      {step === 'idle' && (
        <div className="flex gap-2">
          {!hasTOTP ? (
            <Button variant="primary" size="md" onClick={() => enable.mutate()} loading={enable.isPending}>
              <ShieldCheck className="w-4 h-4 mr-1" /> Activar 2FA
            </Button>
          ) : (
            <Button variant="danger" size="md" onClick={() => setStep('disable')}>
              <ShieldOff className="w-4 h-4 mr-1" /> Desactivar 2FA
            </Button>
          )}
        </div>
      )}

      {step === 'setup' && uri && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">
            Escaneá este código con tu app de autenticación (Google Authenticator, Authy, etc.)
          </p>
          <div className="bg-white p-3 rounded-lg inline-block self-start">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(uri)}&size=150x150`}
              alt="QR 2FA"
              width={150}
              height={150}
            />
          </div>
          <p className="text-xs text-text-tertiary break-all font-mono">{uri}</p>
          <div className="flex items-center gap-2">
            <input
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Código de 6 dígitos"
              maxLength={6}
              className="w-40 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand font-mono tracking-widest"
            />
            <Button variant="primary" size="md" onClick={() => verify.mutate()} loading={verify.isPending} disabled={totpCode.length < 6}>
              Verificar
            </Button>
            <Button variant="ghost" size="md" onClick={() => setStep('idle')}>Cancelar</Button>
          </div>
        </div>
      )}

      {step === 'disable' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">Ingresá el código de tu app para confirmar la desactivación.</p>
          <div className="flex items-center gap-2">
            <input
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Código de 6 dígitos"
              maxLength={6}
              className="w-40 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand font-mono tracking-widest"
            />
            <Button variant="danger" size="md" onClick={() => disable.mutate()} loading={disable.isPending} disabled={disableCode.length < 6}>
              Desactivar
            </Button>
            <Button variant="ghost" size="md" onClick={() => setStep('idle')}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Active sessions section ───────────────────────────────────────────────────

function SessionsSection() {
  const toast = useUIStore((s) => s.toast)
  const qc = useQueryClient()
  const [toRevoke, setToRevoke] = useState<Session | null>(null)

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: authApi.sessions,
  })

  const revoke = useMutation({
    mutationFn: (id: string) => authApi.revokeSession(id),
    onSuccess: () => {
      toast.success('Sesión revocada')
      setToRevoke(null)
      qc.invalidateQueries({ queryKey: ['sessions'] })
    },
    onError: () => toast.error('No se pudo revocar'),
  })

  return (
    <div className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Monitor className="w-4 h-4 text-text-secondary" />
        <p className="font-semibold text-text text-sm">Sesiones activas</p>
      </div>
      {isLoading ? (
        <div className="flex flex-col gap-2">{[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : sessions.length === 0 ? (
        <p className="text-xs text-text-tertiary">Sin otras sesiones activas.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <p className="text-sm text-text font-medium truncate">{s.ip_address}</p>
                <p className="text-xs text-text-tertiary truncate">{s.user_agent}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setToRevoke(s)}>Revocar</Button>
            </div>
          ))}
        </div>
      )}
      <ConfirmModal
        open={!!toRevoke}
        title="Revocar sesión"
        description={`¿Revocar la sesión desde ${toRevoke?.ip_address ?? ''}?`}
        confirmLabel="Revocar"
        variant="danger"
        onConfirm={() => toRevoke && revoke.mutate(toRevoke.id)}
        onClose={() => setToRevoke(null)}
      />
    </div>
  )
}

// ─── Profile info section ──────────────────────────────────────────────────────

function ProfileSection() {
  const user = useAuthStore((s) => s.user)
  if (!user) return null
  return (
    <div className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-2">
      <p className="font-semibold text-text text-sm">Mi perfil</p>
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-brand flex items-center justify-center text-white font-semibold text-lg flex-shrink-0">
          {user.full_name?.charAt(0)?.toUpperCase() ?? '?'}
        </div>
        <div>
          <p className="font-medium text-text">{user.full_name}</p>
          <p className="text-sm text-text-secondary">{user.email}</p>
        </div>
      </div>
    </div>
  )
}

// ─── PerfilPage ────────────────────────────────────────────────────────────────

export function PerfilPage() {
  return (
    <div className="space-y-5 p-4 md:p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold text-text">Mi perfil</h1>
      <ProfileSection />
      <PasswordSection />
      <TwoFASection />
      <SessionsSection />
    </div>
  )
}
