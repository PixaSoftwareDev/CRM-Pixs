import { Users, FileText, TrendingUp, DollarSign } from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import { KPICard } from '../components/ui/KPICard'

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const can = useAuthStore((s) => s.can)

  const firstName = user?.full_name?.split(' ')[0] ?? 'Bienvenido'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">
          {greeting}, {firstName}
        </h1>
        <p className="mt-1 text-sm capitalize text-text-secondary">
          {new Intl.DateTimeFormat('es-AR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          }).format(new Date())}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {can('contacts', 'view') && (
          <KPICard label="Contactos" value="—" icon={<Users size={18} />} />
        )}
        {can('invoices', 'view') && (
          <KPICard label="Facturas este mes" value="—" icon={<FileText size={18} />} />
        )}
        {can('opportunities', 'view') && (
          <KPICard label="Oportunidades activas" value="—" icon={<TrendingUp size={18} />} />
        )}
        {can('leads', 'view') && (
          <KPICard label="Leads nuevos" value="—" icon={<DollarSign size={18} />} />
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        <p className="text-center text-sm text-text-secondary">
          El dashboard completo se construirá en las próximas sesiones. Por ahora verificás que el
          layout, el tema y la autenticación funcionan.
        </p>
      </div>
    </div>
  )
}
