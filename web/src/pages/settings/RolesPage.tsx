import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'
import { useUIStore } from '../../stores/ui'
import { useAuthStore } from '../../stores/auth'
import { adminApi, type Permission, type Role } from '../../lib/api/admin'

// Permission key → role_id → is_enabled
type Matrix = Record<string, Record<string, boolean>>

function buildMatrix(
  roles: Role[],
  perms: Permission[],
  rolePerms: Record<string, string[]>, // role_id → "module:action"[]
): Matrix {
  const m: Matrix = {}
  for (const p of perms) {
    const key = `${p.module}:${p.action}`
    m[key] = {}
    for (const r of roles) {
      m[key][r.id] = rolePerms[r.id]?.includes(key) ?? false
    }
  }
  return m
}

export function RolesPage() {
  const can = useAuthStore((s) => s.can)
  const toast = useUIStore((s) => s.toast)
  const qc = useQueryClient()

  const { data: roles, isLoading: loadRoles, isError: errRoles, refetch: refetchRoles } = useQuery({
    queryKey: ['admin-roles'],
    queryFn: adminApi.roles.list,
  })
  const { data: perms, isLoading: loadPerms, isError: errPerms } = useQuery({
    queryKey: ['admin-permissions'],
    queryFn: adminApi.permissions.list,
  })

  // Fetch permissions for all roles
  const roleIds = (roles ?? []).map((r) => r.id)
  const { data: allRolePerms, isLoading: loadRolePerms } = useQuery({
    queryKey: ['admin-all-role-perms', roleIds.join(',')],
    queryFn: async () => {
      const result: Record<string, string[]> = {}
      await Promise.all(
        (roles ?? []).map(async (r) => {
          const rp = await adminApi.roles.permissions(r.id)
          result[r.id] = rp.map((p) => `${p.module}:${p.action}`)
        }),
      )
      return result
    },
    enabled: (roles?.length ?? 0) > 0,
  })

  const [matrix, setMatrix] = useState<Matrix>({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (roles && perms && allRolePerms) {
      setMatrix(buildMatrix(roles, perms, allRolePerms))
      setDirty(false)
    }
  }, [roles, perms, allRolePerms])

  const toggle = (permKey: string, roleId: string) => {
    setMatrix((prev) => ({
      ...prev,
      [permKey]: { ...prev[permKey], [roleId]: !prev[permKey]?.[roleId] },
    }))
    setDirty(true)
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!roles || !perms) return
      const permById: Record<string, Permission> = {}
      for (const p of perms) permById[`${p.module}:${p.action}`] = p

      await Promise.all(
        Object.entries(matrix).flatMap(([permKey, roleMap]) => {
          const perm = permById[permKey]
          if (!perm) return []
          return Object.entries(roleMap).map(([roleId, enabled]) =>
            enabled
              ? adminApi.roles.upsertPermission(roleId, perm.id, false)
              : adminApi.roles.deletePermission(roleId, perm.id),
          )
        }),
      )
    },
    onSuccess: () => {
      toast.success('Permisos guardados')
      setDirty(false)
      qc.invalidateQueries({ queryKey: ['admin-all-role-perms'] })
    },
    onError: () => toast.error('Error al guardar permisos'),
  })

  const isLoading = loadRoles || loadPerms || loadRolePerms
  const isError = errRoles || errPerms

  if (!can('users', 'view')) {
    return <div className="p-6"><p className="text-text-secondary">Sin permiso para ver roles.</p></div>
  }

  // Group perms by module
  const modules = [...new Set((perms ?? []).map((p) => p.module))].sort()

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text">Roles y permisos</h1>
        {can('roles', 'manage') && dirty && (
          <Button variant="primary" size="md" onClick={() => save.mutate()} loading={save.isPending}>
            <Save className="w-4 h-4 mr-1" /> Guardar cambios
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : isError ? (
        <ErrorState message="No se pudo cargar la grilla." onRetry={() => { refetchRoles() }} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead className="bg-surface-subtle border-b border-border sticky top-0">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-text-secondary min-w-[220px]">Permiso</th>
                {(roles ?? []).map((r) => (
                  <th key={r.id} className="px-3 py-3 font-semibold text-text text-center min-w-[100px]">
                    <div className="text-xs">{r.name}</div>
                    {r.is_system && <div className="text-xs text-text-tertiary font-normal">sistema</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map((mod) => {
                const modPerms = (perms ?? []).filter((p) => p.module === mod)
                return [
                  <tr key={`header-${mod}`} className="bg-surface-subtle/50">
                    <td colSpan={(roles?.length ?? 0) + 1} className="px-4 py-2 font-semibold text-text-secondary uppercase tracking-wide">
                      {mod}
                    </td>
                  </tr>,
                  ...modPerms.map((p) => {
                    const key = `${p.module}:${p.action}`
                    return (
                      <tr key={p.id} className="border-t border-border hover:bg-surface-subtle/40 transition-colors">
                        <td className="px-4 py-2.5 text-text-secondary">
                          <span className="font-medium text-text">{p.action}</span>
                          {p.description && <span className="ml-2 text-text-tertiary">{p.description}</span>}
                        </td>
                        {(roles ?? []).map((r) => (
                          <td key={r.id} className="px-3 py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={matrix[key]?.[r.id] ?? false}
                              onChange={() => can('roles', 'manage') && toggle(key, r.id)}
                              disabled={!can('roles', 'manage')}
                              className="w-4 h-4 accent-brand cursor-pointer disabled:cursor-default"
                            />
                          </td>
                        ))}
                      </tr>
                    )
                  }),
                ]
              })}
            </tbody>
          </table>
        </div>
      )}

      {dirty && (
        <div className="fixed bottom-6 right-6">
          <Button variant="primary" size="lg" onClick={() => save.mutate()} loading={save.isPending}>
            <Save className="w-4 h-4 mr-1" /> Guardar cambios
          </Button>
        </div>
      )}
    </div>
  )
}
