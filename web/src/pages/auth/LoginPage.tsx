import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../../lib/api/auth'
import { useAuthStore } from '../../stores/auth'
import { ApiRequestError } from '../../lib/api/client'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { TOTPStep } from './TOTPStep'

export function LoginPage() {
  const navigate = useNavigate()
  const setUser = useAuthStore((s) => s.setUser)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // When the backend asks for a second factor.
  const [totpUserId, setTotpUserId] = useState<string | null>(null)

  const completeLogin = async () => {
    const [me, permsRes] = await Promise.all([authApi.me(), authApi.myPermissions()])
    setUser(me, permsRes.permissions)
    navigate('/', { replace: true })
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await authApi.login(email, password)
      if (res.totp_required && res.user_id) {
        setTotpUserId(res.user_id)
        return
      }
      await completeLogin()
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.error.message)
      } else {
        setError('No pudimos iniciar sesión. Probá de nuevo.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-raised p-4">
      <div className="w-full max-w-[390px]">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-xl font-semibold text-white">
            P
          </div>
          <h1 className="text-2xl font-semibold text-text">PIXS</h1>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow">
          {totpUserId ? (
            <TOTPStep userId={totpUserId} onSuccess={completeLogin} onBack={() => setTotpUserId(null)} />
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold text-text">Iniciá sesión</h2>

              <Input
                label="Email"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                label="Contraseña"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              {error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}

              <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
                Ingresar
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
