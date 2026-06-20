import {
  LayoutDashboard,
  Users,
  TrendingUp,
  FolderOpen,
  CheckSquare,
  DollarSign,
  Zap,
  Settings,
  Shield,
  type LucideIcon,
} from 'lucide-react'

export interface NavChild {
  key: string
  label: string
  path: string
}

export interface NavItem {
  key: string
  label: string
  icon: LucideIcon
  path?: string
  children?: NavChild[]
}

export const navItems: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { key: 'contacts', label: 'Contactos', path: '/contactos', icon: Users },
  {
    key: 'ventas',
    label: 'Ventas',
    icon: TrendingUp,
    children: [
      { key: 'pipeline',      label: 'Pipeline',      path: '/ventas/pipeline' },
      { key: 'presupuestos',  label: 'Presupuestos',  path: '/ventas/presupuestos' },
      { key: 'agenda',        label: 'Agenda',        path: '/agenda' },
    ],
  },
  { key: 'proyectos', label: 'Proyectos', path: '/proyectos', icon: FolderOpen },
  { key: 'tareas',    label: 'Tareas',    path: '/tareas',    icon: CheckSquare },
  {
    key: 'finanzas',
    label: 'Finanzas',
    icon: DollarSign,
    children: [
      { key: 'facturacion', label: 'Facturación',      path: '/finanzas/facturacion' },
      { key: 'cobros',      label: 'Cobros',            path: '/finanzas/cobros' },
      { key: 'cajas',       label: 'Cajas',             path: '/finanzas/cajas' },
      { key: 'bancos',      label: 'Bancos',            path: '/finanzas/bancos' },
      { key: 'gastos',      label: 'Gastos',            path: '/finanzas/gastos' },
      { key: 'recurrentes', label: 'Pagos recurrentes', path: '/finanzas/recurrentes' },
      { key: 'flujo',       label: 'Flujo de caja',     path: '/finanzas/flujo' },
    ],
  },
  {
    key: 'leads',
    label: 'Leads',
    icon: Zap,
    children: [
      { key: 'leads-gestion',  label: 'Gestión',  path: '/leads' },
      { key: 'leads-scraping', label: 'Scraping', path: '/leads/scraping' },
    ],
  },
  { key: 'vault', label: 'Vault', path: '/vault', icon: Shield },
  {
    key: 'ajustes',
    label: 'Ajustes',
    icon: Settings,
    children: [
      { key: 'ajustes-perfil',       label: 'Mi perfil',   path: '/ajustes/perfil' },
      { key: 'ajustes-usuarios',     label: 'Usuarios',    path: '/ajustes/usuarios' },
      { key: 'ajustes-roles',        label: 'Perfiles y permisos', path: '/ajustes/roles' },
      { key: 'ajustes-empresa',      label: 'Empresa',     path: '/ajustes/empresa' },
      { key: 'ajustes-catalogos',    label: 'Catálogos',   path: '/ajustes/catalogos' },
      { key: 'ajustes-cotizaciones', label: 'Cotizaciones',path: '/ajustes/cotizaciones' },
      { key: 'ajustes-auditoria',    label: 'Auditoría',   path: '/ajustes/auditoria' },
    ],
  },
]
