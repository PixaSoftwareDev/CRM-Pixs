import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth'
import { authApi } from '../../lib/api/auth'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)
  const setUser = useAuthStore((s) => s.setUser)
  const clearUser = useAuthStore((s) => s.clearUser)
  const setLoading = useAuthStore((s) => s.setLoading)
  const location = useLocation()

  useEffect(() => {
    // Always re-validate the session against the backend on mount, even if the
    // persisted store says we're authenticated (the cookie may have expired).
    setLoading(true)
    Promise.all([authApi.me(), authApi.myPermissions()])
      .then(([me, permsRes]) => setUser(me, permsRes.permissions))
      .catch(() => clearUser())
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
