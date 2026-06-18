import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MeResponse, Permission } from '../lib/api/auth'

interface AuthState {
  user: MeResponse | null
  permissions: Permission[]
  isAuthenticated: boolean
  isLoading: boolean

  setUser: (user: MeResponse, permissions: Permission[]) => void
  clearUser: () => void
  setLoading: (v: boolean) => void

  can: (module: string, action: string) => boolean
  canAny: (module: string, actions: string[]) => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      permissions: [],
      isAuthenticated: false,
      isLoading: true,

      setUser: (user, permissions) =>
        set({ user, permissions, isAuthenticated: true, isLoading: false }),

      clearUser: () =>
        set({ user: null, permissions: [], isAuthenticated: false, isLoading: false }),

      setLoading: (v) => set({ isLoading: v }),

      can: () => get().isAuthenticated,

      canAny: () => get().isAuthenticated,
    }),
    {
      name: 'pixs-auth',
      // Only persist user info, not isLoading.
      partialize: (state) => ({
        user: state.user,
        permissions: state.permissions,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)
