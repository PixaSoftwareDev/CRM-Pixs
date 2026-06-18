import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RequireAuth } from './components/layout/RequireAuth'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './pages/auth/LoginPage'
import { SessionsPage } from './pages/auth/SessionsPage'
import { DashboardPage } from './pages/DashboardPage'
import { ContactsPage } from './pages/contacts/ContactsPage'
import { ContactDetailPage } from './pages/contacts/ContactDetailPage'
import { AgendaPage } from './pages/calendar/AgendaPage'
import { PipelinePage } from './pages/sales/PipelinePage'
import { QuotesPage } from './pages/sales/QuotesPage'
import { QuoteFormPage } from './pages/sales/QuoteFormPage'
import { ProjectsPage } from './pages/projects/ProjectsPage'
import { ProjectDetailPage } from './pages/projects/ProjectDetailPage'
import { TasksPage } from './pages/tasks/TasksPage'
import { VaultPage } from './pages/vault/VaultPage'
import { ToastContainer } from './components/ui/Toast'
import { useTheme } from './hooks/useTheme'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

function ThemeApplier({ children }: { children: React.ReactNode }) {
  useTheme()
  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeApplier>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/*"
              element={
                <RequireAuth>
                  <AppLayout>
                    <Routes>
                      <Route path="/" element={<DashboardPage />} />
                      <Route path="/contactos" element={<ContactsPage />} />
                      <Route path="/contactos/:id" element={<ContactDetailPage />} />
                      <Route path="/ventas/pipeline" element={<PipelinePage />} />
                      <Route path="/ventas/presupuestos" element={<QuotesPage />} />
                      <Route path="/ventas/presupuestos/nuevo" element={<QuoteFormPage />} />
                      <Route path="/ventas/presupuestos/:id/editar" element={<QuoteFormPage />} />
                      <Route path="/agenda" element={<AgendaPage />} />
                      <Route path="/leads" element={<PlaceholderPage title="Leads" />} />
                      <Route path="/proyectos" element={<ProjectsPage />} />
                      <Route path="/proyectos/:id" element={<ProjectDetailPage />} />
                      <Route path="/tareas" element={<TasksPage />} />
                      <Route
                        path="/finanzas/facturacion"
                        element={<PlaceholderPage title="Facturación" />}
                      />
                      <Route path="/finanzas/cobros" element={<PlaceholderPage title="Cobros" />} />
                      <Route path="/finanzas/cajas" element={<PlaceholderPage title="Cajas" />} />
                      <Route path="/finanzas/bancos" element={<PlaceholderPage title="Bancos" />} />
                      <Route path="/finanzas/gastos" element={<PlaceholderPage title="Gastos" />} />
                      <Route
                        path="/finanzas/flujo"
                        element={<PlaceholderPage title="Flujo de caja" />}
                      />
                      <Route path="/vault" element={<VaultPage />} />
                      <Route path="/ajustes" element={<PlaceholderPage title="Ajustes" />} />
                      <Route path="/ajustes/sesiones" element={<SessionsPage />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </AppLayout>
                </RequireAuth>
              }
            />
          </Routes>
          <ToastContainer />
        </ThemeApplier>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-semibold text-text">{title}</h1>
      <div className="rounded-xl border border-border bg-surface p-6">
        <p className="text-sm text-text-secondary">
          Esta sección se construirá en una próxima sesión.
        </p>
      </div>
    </div>
  )
}
