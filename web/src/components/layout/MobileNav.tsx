import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, MoreHorizontal } from 'lucide-react'
import { useAuthStore } from '../../stores/auth'
import { navItems, type NavItem, type NavChild } from './nav'
import { cn } from '../../lib/utils'
import { Modal } from '../ui/Modal'

export function MobileNav() {
  const can = useAuthStore((s) => s.can)
  const canAny = useAuthStore((s) => s.canAny)
  const [moreOpen, setMoreOpen] = useState(false)

  const childVisible = (c: NavChild) =>
    !c.permission || can(c.permission.module, c.permission.action)

  const itemVisible = (item: NavItem): boolean => {
    if (item.key === 'ajustes') {
      return canAny('settings', ['manage']) || canAny('users', ['manage'])
    }
    if (item.children) return item.children.some(childVisible)
    if (!item.permission) return true
    return can(item.permission.module, item.permission.action)
  }

  const tabBase =
    'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium min-h-[56px]'

  return (
    <>
      <nav
        className="fixed bottom-0 inset-x-0 z-30 flex border-t border-border bg-surface md:hidden"
        aria-label="Navegación inferior"
      >
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            cn(tabBase, isActive ? 'text-brand' : 'text-text-secondary')
          }
        >
          <LayoutDashboard size={22} />
          <span>Inicio</span>
        </NavLink>
        {can('contacts', 'view') && (
          <NavLink
            to="/contactos"
            className={({ isActive }) =>
              cn(tabBase, isActive ? 'text-brand' : 'text-text-secondary')
            }
          >
            <Users size={22} />
            <span>Contactos</span>
          </NavLink>
        )}
        <button
          onClick={() => setMoreOpen(true)}
          className={cn(tabBase, 'text-text-secondary')}
        >
          <MoreHorizontal size={22} />
          <span>Más</span>
        </button>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Menú" size="sm">
        <div className="flex flex-col gap-1">
          {navItems.filter(itemVisible).map((item) => {
            const Icon = item.icon
            if (item.children) {
              return item.children.filter(childVisible).map((child) => (
                <NavLink
                  key={child.key}
                  to={child.path}
                  onClick={() => setMoreOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 text-base text-text hover:bg-surface-raised"
                >
                  <Icon size={20} className="text-text-tertiary" />
                  <span>{child.label}</span>
                </NavLink>
              ))
            }
            return (
              <NavLink
                key={item.key}
                to={item.path!}
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-base text-text hover:bg-surface-raised"
              >
                <Icon size={20} className="text-text-tertiary" />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </div>
      </Modal>
    </>
  )
}
