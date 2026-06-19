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
import { FacturacionPage } from './pages/finance/FacturacionPage'
import { CobrosPage } from './pages/finance/CobrosPage'
import { CajasPage } from './pages/finance/CajasPage'
import { BancosPage } from './pages/finance/BancosPage'
import { GastosPage } from './pages/finance/GastosPage'
import { RecurrentesPage } from './pages/finance/RecurrentesPage'
import { FlujoCajaPage } from './pages/finance/FlujoCajaPage'
import { LeadsPage } from './pages/leads/LeadsPage'
import { ScrapingPage } from './pages/leads/ScrapingPage'
import { UsuariosPage } from './pages/settings/UsuariosPage'
import { EmpresaPage } from './pages/settings/EmpresaPage'
import { CatalogosPage } from './pages/settings/CatalogosPage'
import { CotizacionesPage } from './pages/settings/CotizacionesPage'
import { AuditoriaPage } from './pages/settings/AuditoriaPage'
import { PerfilPage } from './pages/settings/PerfilPage'
import { ToastContainer } from './components/ui/Toast'
import { GlobalSearch, useGlobalSearch } from './components/GlobalSearch'
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

function AppWithSearch() {
  const { open, setOpen } = useGlobalSearch()
  return (
    <>
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
                  <Route path="/leads" element={<LeadsPage />} />
                  <Route path="/leads/scraping" element={<ScrapingPage />} />
                  <Route path="/proyectos" element={<ProjectsPage />} />
                  <Route path="/proyectos/:id" element={<ProjectDetailPage />} />
                  <Route path="/tareas" element={<TasksPage />} />
                  <Route path="/finanzas" element={<Navigate to="/finanzas/facturacion" replace />} />
                  <Route path="/finanzas/facturacion" element={<FacturacionPage />} />
                  <Route path="/finanzas/cobros" element={<CobrosPage />} />
                  <Route path="/finanzas/cajas" element={<CajasPage />} />
                  <Route path="/finanzas/bancos" element={<BancosPage />} />
                  <Route path="/finanzas/gastos" element={<GastosPage />} />
                  <Route path="/finanzas/recurrentes" element={<RecurrentesPage />} />
                  <Route path="/finanzas/flujo" element={<FlujoCajaPage />} />
                  <Route path="/vault" element={<VaultPage />} />
                  <Route path="/ajustes" element={<PerfilPage />} />
                  <Route path="/ajustes/sesiones" element={<SessionsPage />} />
                  <Route path="/ajustes/usuarios" element={<UsuariosPage />} />
                  <Route path="/ajustes/empresa" element={<EmpresaPage />} />
                  <Route path="/ajustes/catalogos" element={<CatalogosPage />} />
                  <Route path="/ajustes/cotizaciones" element={<CotizacionesPage />} />
                  <Route path="/ajustes/auditoria" element={<AuditoriaPage />} />
                  <Route path="/ajustes/perfil" element={<PerfilPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </AppLayout>
            </RequireAuth>
          }
        />
      </Routes>
      <GlobalSearch open={open} onClose={() => setOpen(false)} />
    </>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeApplier>
          <AppWithSearch />
          <ToastContainer />
        </ThemeApplier>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
