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

export interface NavPermission {
  module: string
  action: string
}

export interface NavChild {
  key: string
  label: string
  path: string
  permission?: NavPermission
}

export interface NavItem {
  key: string
  label: string
  icon: LucideIcon
  path?: string
  permission?: NavPermission
  children?: NavChild[]
}

export const navItems: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/', icon: LayoutDashboard },
  {
    key: 'contacts',
    label: 'Contactos',
    path: '/contactos',
    icon: Users,
    permission: { module: 'contacts', action: 'view' },
  },
  {
    key: 'ventas',
    label: 'Ventas',
    icon: TrendingUp,
    children: [
      {
        key: 'pipeline',
        label: 'Pipeline',
        path: '/ventas/pipeline',
        permission: { module: 'opportunities', action: 'view' },
      },
      {
        key: 'presupuestos',
        label: 'Presupuestos',
        path: '/ventas/presupuestos',
        permission: { module: 'quotes', action: 'view' },
      },
      {
        key: 'agenda',
        label: 'Agenda',
        path: '/agenda',
        permission: { module: 'calendar', action: 'view' },
      },
    ],
  },
  {
    key: 'proyectos',
    label: 'Proyectos',
    path: '/proyectos',
    icon: FolderOpen,
    permission: { module: 'projects', action: 'view' },
  },
  {
    key: 'tareas',
    label: 'Tareas',
    path: '/tareas',
    icon: CheckSquare,
    permission: { module: 'tasks', action: 'view' },
  },
  {
    key: 'finanzas',
    label: 'Finanzas',
    icon: DollarSign,
    children: [
      {
        key: 'facturacion',
        label: 'Facturación',
        path: '/finanzas/facturacion',
        permission: { module: 'invoices', action: 'view' },
      },
      {
        key: 'cobros',
        label: 'Cobros',
        path: '/finanzas/cobros',
        permission: { module: 'receipts', action: 'view' },
      },
      {
        key: 'cajas',
        label: 'Cajas',
        path: '/finanzas/cajas',
        permission: { module: 'cash_registers', action: 'view' },
      },
      {
        key: 'bancos',
        label: 'Bancos',
        path: '/finanzas/bancos',
        permission: { module: 'banks', action: 'view' },
      },
      {
        key: 'gastos',
        label: 'Gastos',
        path: '/finanzas/gastos',
        permission: { module: 'expenses', action: 'view' },
      },
      {
        key: 'flujo',
        label: 'Flujo de caja',
        path: '/finanzas/flujo',
        permission: { module: 'cash_flow', action: 'view' },
      },
    ],
  },
  {
    key: 'leads',
    label: 'Leads',
    path: '/leads',
    icon: Zap,
    permission: { module: 'leads', action: 'view' },
  },
  {
    key: 'vault',
    label: 'Vault',
    path: '/vault',
    icon: Shield,
    permission: { module: 'vault', action: 'view' },
  },
  { key: 'ajustes', label: 'Ajustes', path: '/ajustes', icon: Settings },
]
