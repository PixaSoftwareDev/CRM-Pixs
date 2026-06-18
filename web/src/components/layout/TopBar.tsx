import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Bell, ChevronDown, User, Shield, Monitor, Moon, Sun, LogOut } from 'lucide-react'
import { useAuthStore } from '../../stores/auth'
import { useUIStore } from '../../stores/ui'
import { authApi } from '../../lib/api/auth'
import { cn } from '../../lib/utils'

export function TopBar() {
  const user = useAuthStore((s) => s.user)
  const clearUser = useAuthStore((s) => s.clearUser)
  const theme = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)
  const toast = useUIStore((s) => s.toast)
  const navigate = useNavigate()

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch {
      // ignore — clear locally regardless
    }
    clearUser()
    navigate('/login', { replace: true })
  }

  const cycleTheme = () => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
    setTheme(next)
    toast.info(
      next === 'light' ? 'Tema claro' : next === 'dark' ? 'Tema oscuro' : 'Tema del sistema',
    )
  }

  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor

  return (
    <header className="flex h-16 items-center gap-3 border-b border-border bg-surface px-4">
      {/* Search trigger (Cmd+K placeholder) */}
      <button
        className="flex h-10 flex-1 max-w-md items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 text-sm text-text-tertiary hover:border-border-strong"
        aria-label="Buscar"
        onClick={() => toast.info('La búsqueda global llega en una próxima versión')}
      >
        <Search size={18} />
        <span className="flex-1 text-left">Buscar…</span>
        <kbd className="hidden sm:inline rounded border border-border bg-surface px-1.5 py-0.5 text-xs">
          ⌘K
        </kbd>
      </button>

      <div className="flex-1" />

      {/* Notifications */}
      <button
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-raised"
        aria-label="Notificaciones"
        onClick={() => toast.info('No tenés notificaciones nuevas')}
      >
        <Bell size={20} />
      </button>

      {/* Avatar menu */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-10 items-center gap-2 rounded-lg px-2 hover:bg-surface-raised"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-light text-brand text-sm font-semibold">
            {user?.full_name.charAt(0).toUpperCase() ?? '?'}
          </span>
          <ChevronDown size={16} className="hidden sm:block text-text-tertiary" />
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-64 rounded-xl border border-border bg-surface-overlay py-2 shadow-overlay"
          >
            <div className="border-b border-border px-4 py-2">
              <p className="truncate text-sm font-medium text-text">{user?.full_name}</p>
              <p className="truncate text-xs text-text-tertiary">{user?.email}</p>
            </div>
            <MenuButton icon={User} label="Perfil" onClick={() => navigate('/ajustes')} />
            <MenuButton
              icon={Shield}
              label="Seguridad y 2FA"
              onClick={() => navigate('/ajustes/sesiones')}
            />
            <MenuButton
              icon={ThemeIcon}
              label={
                theme === 'light' ? 'Tema: claro' : theme === 'dark' ? 'Tema: oscuro' : 'Tema: sistema'
              }
              onClick={cycleTheme}
            />
            <div className="my-1 border-t border-border" />
            <MenuButton icon={LogOut} label="Cerrar sesión" onClick={handleLogout} danger />
          </div>
        )}
      </div>
    </header>
  )
}

function MenuButton({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof User
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-2 text-sm hover:bg-surface-raised',
        danger ? 'text-danger' : 'text-text',
      )}
    >
      <Icon size={18} className={danger ? 'text-danger' : 'text-text-tertiary'} />
      <span>{label}</span>
    </button>
  )
}
