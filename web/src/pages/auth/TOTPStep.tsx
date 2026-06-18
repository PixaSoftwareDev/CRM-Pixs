import { useState, type FormEvent } from 'react'
import { ArrowLeft } from 'lucide-react'
import { authApi } from '../../lib/api/auth'
import { ApiRequestError } from '../../lib/api/client'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'

interface TOTPStepProps {
  userId: string
  onSuccess: () => Promise<void>
  onBack: () => void
}

export function TOTPStep({ userId, onSuccess, onBack }: TOTPStepProps) {
  const [code, setCode] = useState('')
  const [useBackup, setUseBackup] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await authApi.loginTotp(userId, code.trim())
      await onSuccess()
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.error.message)
      } else {
        setError('No pudimos validar el código. Probá de nuevo.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 self-start text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft size={16} />
        Volver
      </button>

      <div>
        <h2 className="text-lg font-semibold text-text">Verificación en dos pasos</h2>
        <p className="mt-1 text-sm text-text-secondary">
          {useBackup
            ? 'Ingresá uno de tus códigos de respaldo.'
            : 'Ingresá el código de tu app de autenticación.'}
        </p>
      </div>

      <Input
        label={useBackup ? 'Código de respaldo' : 'Código'}
        inputMode={useBackup ? 'text' : 'numeric'}
        autoComplete="one-time-code"
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value)}
        required
      />

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
        Verificar
      </Button>

      <button
        type="button"
        onClick={() => {
          setUseBackup((v) => !v)
          setCode('')
          setError(null)
        }}
        className="text-sm text-brand hover:underline"
      >
        {useBackup ? 'Usar código de la app' : 'Usar código de respaldo'}
      </button>
    </form>
  )
}
