import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, ToggleLeft, ToggleRight, Shield } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { SlideOver } from '../../components/ui/SlideOver'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { ConfirmModal } from '../../components/ui/Modal'
import { useUIStore } from '../../stores/ui'
import { useAuthStore } from '../../stores/auth'
import { adminApi, type AdminUser } from '../../lib/api/admin'

const createUserSchema = z.object({
  email: z.string().email('Email inválido'),
  full_name: z.string().min(1, 'Requerido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  role_id: z.string().optional(),
})
type CreateUserValues = z.infer<typeof createUserSchema>

function UserForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useUIStore((s) => s.toast)
  const { data: roles } = useQuery({ queryKey: ['admin-roles'], queryFn: adminApi.roles.list })
  const { register, handleSubmit, formState: { errors } } = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
  })
  const save = useMutation({
    mutationFn: (data: CreateUserValues) => adminApi.users.create({
      email: data.email,
      full_name: data.full_name,
      password: data.password,
      role_id: data.role_id || undefined,
    }),
    onSuccess: () => { toast.success('Usuario creado'); onSaved() },
    onError: (err: unknown) => toast.error((err as { message?: string })?.message ?? 'Error al crear usuario'),
  })
  const roleOptions = [
    { value: '', label: 'Sin rol (asignar después)' },
    ...(roles ?? []).map((r) => ({ value: r.id, label: r.name })),
  ]
  return (
    <SlideOver open onClose={onClose} title="Nuevo usuario">
      <form onSubmit={handleSubmit((d) => save.mutate(d))} className="flex flex-col gap-4">
        <Input label="Email *" type="email" {...register('email')} error={errors.email?.message} />
        <Input label="Nombre completo *" {...register('full_name')} error={errors.full_name?.message} />
        <Input label="Contraseña *" type="password" {...register('password')} error={errors.password?.message} />
        <Select label="Rol inicial" {...register('role_id')} options={roleOptions} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" size="md" loading={save.isPending}>Crear usuario</Button>
        </div>
      </form>
    </SlideOver>
  )
}

function UserRolesPanel({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const toast = useUIStore((s) => s.toast)
  const qc = useQueryClient()
  const { data: userRoles, isLoading } = useQuery({
    queryKey: ['user-roles', user.id],
    queryFn: () => adminApi.users.getRoles(user.id),
  })
  const { data: allRoles } = useQuery({ queryKey: ['admin-roles'], queryFn: adminApi.roles.list })

  const assign = useMutation({
    mutationFn: (role_id: string) => adminApi.users.assignRole(user.id, role_id),
    onSuccess: () => { toast.success('Rol asignado'); qc.invalidateQueries({ queryKey: ['user-roles', user.id] }) },
    onError: () => toast.error('Error al asignar rol'),
  })
  const remove = useMutation({
    mutationFn: (role_id: string) => adminApi.users.removeRole(user.id, role_id),
    onSuccess: () => { toast.success('Rol removido'); qc.invalidateQueries({ queryKey: ['user-roles', user.id] }) },
    onError: () => toast.error('Error al remover rol'),
  })

  const assignedIds = new Set((userRoles ?? []).map((r) => r.role_id))
  const unassigned = (allRoles ?? []).filter((r) => !assignedIds.has(r.id))

  return (
    <SlideOver open onClose={onClose} title={`Roles — ${user.full_name}`}>
      {isLoading ? (
        <div className="flex flex-col gap-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-medium text-text-secondary mb-2">Roles asignados</p>
            {(userRoles ?? []).length === 0 ? (
              <p className="text-xs text-text-tertiary">Sin roles asignados</p>
            ) : (
              <div className="flex flex-col gap-2">
                {(userRoles ?? []).map((r) => (
                  <div key={r.role_id} className="flex items-center justify-between rounded-lg border border-border p-2.5">
                    <span className="text-sm text-text">{r.name ?? r.role_id.slice(0, 8)}</span>
                    <Button variant="danger" size="sm" onClick={() => remove.mutate(r.role_id)} loading={remove.isPending}>
                      Quitar
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {unassigned.length > 0 && (
            <div>
              <p className="text-sm font-medium text-text-secondary mb-2">Agregar rol</p>
              <div className="flex flex-col gap-2">
                {unassigned.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg border border-border p-2.5">
                    <div>
                      <span className="text-sm text-text">{r.name}</span>
                      {r.description && <p className="text-xs text-text-tertiary">{r.description}</p>}
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => assign.mutate(r.id)} loading={assign.isPending}>
                      Asignar
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </SlideOver>
  )
}

export function UsuariosPage() {
  const can = useAuthStore((s) => s.can)
  const toast = useUIStore((s) => s.toast)
  const qc = useQueryClient()

  const [showCreate, setShowCreate] = useState(false)
  const [rolesUser, setRolesUser] = useState<AdminUser | null>(null)
  const [confirmToggle, setConfirmToggle] = useState<AdminUser | null>(null)

  const { data: users, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-users'],
    queryFn: adminApi.users.list,
  })

  const toggleActive = useMutation({
    mutationFn: (u: AdminUser) => adminApi.users.toggleActive(u.id, !u.is_active),
    onSuccess: (_, u) => {
      toast.success(u.is_active ? 'Usuario desactivado' : 'Usuario activado')
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setConfirmToggle(null)
    },
    onError: (err: unknown) => toast.error((err as { message?: string })?.message ?? 'Error'),
  })

  if (!can('users', 'view')) {
    return <div className="p-6"><p className="text-text-secondary">Sin permiso para ver usuarios.</p></div>
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text">Usuarios</h1>
        {can('users', 'manage') && (
          <Button variant="primary" size="md" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1" /> Nuevo usuario
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : isError ? (
        <ErrorState message="No se pudieron cargar los usuarios." onRetry={() => refetch()} />
      ) : (users ?? []).length === 0 ? (
        <EmptyState title="Sin usuarios" description="Creá el primer usuario del equipo." action={can('users', 'manage') ? { label: 'Nuevo usuario', onClick: () => setShowCreate(true) } : undefined} />
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-subtle border-b border-border">
              <tr>
                {['Nombre', 'Email', 'Estado', 'Acciones'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(users ?? []).map((u) => (
                <tr key={u.id} className="hover:bg-surface-subtle transition-colors">
                  <td className="px-4 py-3 font-medium text-text">{u.full_name}</td>
                  <td className="px-4 py-3 text-text-secondary">{u.email}</td>
                  <td className="px-4 py-3">
                    <StatusBadge label={u.is_active ? 'Activo' : 'Inactivo'} color={u.is_active ? 'success' : 'neutral'} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setRolesUser(u)}>
                        <Shield className="w-4 h-4" />
                      </Button>
                      {can('users', 'manage') && (
                        <button
                          onClick={() => setConfirmToggle(u)}
                          className="p-1 rounded hover:bg-surface-raised transition-colors"
                          title={u.is_active ? 'Desactivar' : 'Activar'}
                        >
                          {u.is_active
                            ? <ToggleRight className="w-5 h-5 text-success" />
                            : <ToggleLeft className="w-5 h-5 text-text-tertiary" />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <UserForm
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ['admin-users'] }) }}
        />
      )}
      {rolesUser && <UserRolesPanel user={rolesUser} onClose={() => setRolesUser(null)} />}

      <ConfirmModal
        open={!!confirmToggle}
        title={confirmToggle?.is_active ? 'Desactivar usuario' : 'Activar usuario'}
        description={
          confirmToggle?.is_active
            ? `¿Desactivar a ${confirmToggle?.full_name}? No podrá iniciar sesión.`
            : `¿Activar a ${confirmToggle?.full_name}?`
        }
        confirmLabel={confirmToggle?.is_active ? 'Desactivar' : 'Activar'}
        variant={confirmToggle?.is_active ? 'danger' : 'primary'}
        onConfirm={() => confirmToggle && toggleActive.mutate(confirmToggle)}
        onClose={() => setConfirmToggle(null)}
      />
    </div>
  )
}
