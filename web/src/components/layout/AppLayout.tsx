import { useState } from 'react'
import { type ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { MobileNav } from './MobileNav'
import { TaskForm } from '../../pages/tasks/TaskForm'
import { projectsApi } from '../../lib/api/projects'

export function AppLayout({ children }: { children: ReactNode }) {
  const [quickTaskOpen, setQuickTaskOpen] = useState(false)
  const projectsQ = useQuery({ queryKey: ['projects'], queryFn: () => projectsApi.list() })

  return (
    <div className="flex h-screen overflow-hidden bg-surface-raised">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        {/* pb-20 on mobile leaves room for the bottom nav */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">{children}</main>
      </div>
      <MobileNav />

      {/* Botón flotante de tarea rápida */}
      <button
        type="button"
        onClick={() => setQuickTaskOpen(true)}
        title="Nueva tarea"
        className="fixed bottom-24 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white shadow-lg hover:bg-brand/90 active:scale-95 transition-transform md:bottom-6"
      >
        <Plus size={22} />
      </button>

      {quickTaskOpen && (
        <TaskForm
          open={quickTaskOpen}
          onClose={() => setQuickTaskOpen(false)}
          projects={projectsQ.data ?? []}
        />
      )}
    </div>
  )
}
