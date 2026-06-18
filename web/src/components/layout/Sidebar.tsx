import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuthStore } from '../../stores/auth'
import { useUIStore } from '../../stores/ui'
import { navItems, type NavItem, type NavChild } from './nav'
import { cn } from '../../lib/utils'

function useVisibleNav() {
  const can = useAuthStore((s) => s.can)
  const canAny = useAuthStore((s) => s.canAny)

  const childVisible = (child: NavChild) =>
    !child.permission || can(child.permission.module, child.permission.action)

  const itemVisible = (item: NavItem): boolean => {
    if (item.key === 'ajustes') {
      return canAny('settings', ['manage']) || canAny('users', ['manage'])
    }
    if (item.children) {
      return item.children.some(childVisible)
    }
    if (!item.permission) return true
    return can(item.permission.module, item.permission.action)
  }

  return { itemVisible, childVisible }
}

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const user = useAuthStore((s) => s.user)
  const { itemVisible, childVisible } = useVisibleNav()
  const location = useLocation()

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col border-r border-border bg-surface transition-all duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 px-4 border-b border-border">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white font-semibold">
          P
        </div>
        {!collapsed && (
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-text">PIXS</span>
            <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-medium text-text-tertiary">
              v0.1
            </span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-1" aria-label="Navegación principal">
        {navItems.filter(itemVisible).map((item) => (
          <NavEntry
            key={item.key}
            item={item}
            collapsed={collapsed}
            childVisible={childVisible}
            currentPath={location.pathname}
          />
        ))}
      </nav>

      {/* Footer: collapse + user */}
      <div className="border-t border-border p-2 space-y-1">
        <button
          onClick={toggleSidebar}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-text-secondary hover:bg-surface-raised"
          aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
        >
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          {!collapsed && <span>Contraer</span>}
        </button>
        {!collapsed && user && (
          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-light text-brand text-sm font-semibold">
              {user.full_name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text">{user.full_name}</p>
              <p className="truncate text-xs text-text-tertiary">{user.email}</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

function NavEntry({
  item,
  collapsed,
  childVisible,
  currentPath,
}: {
  item: NavItem
  collapsed: boolean
  childVisible: (c: NavChild) => boolean
  currentPath: string
}) {
  const children = item.children?.filter(childVisible) ?? []
  const hasActiveChild = children.some((c) => currentPath.startsWith(c.path))
  const [open, setOpen] = useState(hasActiveChild)
  const Icon = item.icon

  const linkBase =
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors'

  if (children.length > 0) {
    return (
      <div>
        <button
          onClick={() => setOpen((v) => !v)}
          className={cn(linkBase, 'w-full text-text-secondary hover:bg-surface-raised hover:text-text')}
          aria-expanded={open}
        >
          <Icon size={20} className="shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{item.label}</span>
              <ChevronDown
                size={16}
                className={cn('transition-transform', open && 'rotate-180')}
              />
            </>
          )}
        </button>
        {open && !collapsed && (
          <div className="ml-4 mt-1 space-y-1 border-l border-border pl-3">
            {children.map((child) => (
              <NavLink
                key={child.key}
                to={child.path}
                className={({ isActive }) =>
                  cn(
                    'block rounded-lg px-3 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-brand-light text-brand font-medium'
                      : 'text-text-secondary hover:bg-surface-raised hover:text-text',
                  )
                }
              >
                {child.label}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <NavLink
      to={item.path!}
      end={item.path === '/'}
      className={({ isActive }) =>
        cn(
          linkBase,
          isActive
            ? 'bg-brand-light text-brand'
            : 'text-text-secondary hover:bg-surface-raised hover:text-text',
        )
      }
      title={collapsed ? item.label : undefined}
    >
      <Icon size={20} className="shrink-0" />
      {!collapsed && <span>{item.label}</span>}
    </NavLink>
  )
}
