import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'

interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

interface ActiveTimer {
  taskId: string
  startedAt: string
}

interface UIState {
  theme: Theme
  sidebarCollapsed: boolean
  toasts: Toast[]
  activeTimer: ActiveTimer | null

  setTheme: (t: Theme) => void
  toggleSidebar: () => void
  setActiveTimer: (timer: ActiveTimer | null) => void
  addToast: (type: Toast['type'], message: string) => void
  removeToast: (id: string) => void
  toast: {
    success: (message: string) => void
    error: (message: string) => void
    info: (message: string) => void
  }
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      sidebarCollapsed: false,
      toasts: [],
      activeTimer: null,

      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setActiveTimer: (activeTimer) => set({ activeTimer }),

      addToast: (type, message) => {
        const id = crypto.randomUUID()
        set((s) => ({ toasts: [...s.toasts, { id, type, message }] }))
        setTimeout(() => get().removeToast(id), 3000)
      },

      removeToast: (id) =>
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      toast: {
        success: (message) => get().addToast('success', message),
        error: (message) => get().addToast('error', message),
        info: (message) => get().addToast('info', message),
      },
    }),
    {
      name: 'pixs-ui',
      partialize: (state) => ({
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        activeTimer: state.activeTimer,
      }),
    },
  ),
)
