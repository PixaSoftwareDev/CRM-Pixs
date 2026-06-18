import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, ArrowRightLeft } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { MoneyInput } from '../../components/ui/MoneyInput'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { SlideOver } from '../../components/ui/SlideOver'
import { ConfirmModal } from '../../components/ui/Modal'
import { KPICard } from '../../components/ui/KPICard'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { Skeleton } from '../../components/ui/Skeleton'
import { useAuthStore } from '../../stores/auth'
import { useUIStore } from '../../stores/ui'
import { formatMoney, formatDate } from '../../lib/utils'
import { financeApi, type CashRegister, type CashMovement } from '../../lib/api/finance'

export function CajasPage() {
  const can = useAuthStore((s) => s.can)
  const [selected, setSelected] = useState<CashRegister | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)

  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)

  const { data: registers, isLoading, isError, refetch } = useQuery({
    queryKey: ['cash-registers'],
    queryFn: () => financeApi.cashRegisters.list(),
  })

  if (selected) {
    return (
      <CashRegisterDetail
        register={selected}
        onBack={() => setSelected(null)}
      />
    )
  }

  const columns: Column<CashRegister>[] = [
    { key: 'name', header: 'Nombre', render: (r) => <span className="font-medium text-text">{r.name}</span> },
    { key: 'currency', header: 'Moneda', render: (r) => <StatusBadge label={r.currency} color="neutral" /> },
    {
      key: 'is_active',
      header: 'Estado',
      render: (r) => (
        <StatusBadge label={r.is_active ? 'Activa' : 'Inactiva'} color={r.is_active ? 'success' : 'neutral'} />
      ),
    },
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-text">Cajas</h1>
        <div className="flex gap-2">
          {can('finance', 'edit') && (
            <Button variant="secondary" size="lg" onClick={() => setTransferOpen(true)}>
              <ArrowRightLeft size={18} /> Transferir
            </Button>
          )}
          {can('finance', 'create') && (
            <Button variant="primary" size="lg" onClick={() => setCreateOpen(true)}>
              <Plus size={20} /> Nueva caja
            </Button>
          )}
        </div>
      </div>

      {isError ? (
        <ErrorState message="No pudimos cargar las cajas." onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={registers ?? []}
          rowKey={(r) => r.id}
          loading={isLoading}
          onRowClick={(r) => setSelected(r)}
          emptyState={
            <EmptyState
              title="Sin cajas configuradas"
              description="Configurá tu primera caja para registrar movimientos de efectivo."
              action={
                can('finance', 'create')
                  ? { label: 'Nueva caja', onClick: () => setCreateOpen(true) }
                  : undefined
              }
            />
          }
        />
      )}

      {createOpen && (
        <CashRegisterForm
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['cash-registers'] })
            setCreateOpen(false)
          }}
        />
      )}

      {transferOpen && (
        <TransferForm
          registers={registers ?? []}
          onClose={() => setTransferOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['cash-registers'] })
            qc.invalidateQueries({ queryKey: ['cash-movements'] })
            setTransferOpen(false)
            toast.success('Transferencia realizada')
          }}
        />
      )}
    </div>
  )
}

// ─── Register detail ──────────────────────────────────────────────────────────

function CashRegisterDetail({ register, onBack }: { register: CashRegister; onBack: () => void }) {
  const can = useAuthStore((s) => s.can)
  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)
  const [movementOpen, setMovementOpen] = useState(false)
  const [openSessionOpen, setOpenSessionOpen] = useState(false)
  const [closeSessionOpen, setCloseSessionOpen] = useState(false)

  const { data: detail, isLoading, isError } = useQuery({
    queryKey: ['cash-register', register.id],
    queryFn: () => financeApi.cashRegisters.get(register.id),
  })
  const { data: movements, isLoading: loadingMv } = useQuery({
    queryKey: ['cash-movements', register.id],
    queryFn: () => financeApi.cashRegisters.movements(register.id),
  })

  const movColumns: Column<CashMovement>[] = [
    { key: 'created_at', header: 'Fecha', render: (m) => formatDate(m.created_at) },
    {
      key: 'type',
      header: 'Tipo',
      render: (m) => (
        <StatusBadge
          label={m.type === 'income' ? 'Ingreso' : 'Egreso'}
          color={m.type === 'income' ? 'success' : 'danger'}
        />
      ),
    },
    { key: 'description', header: 'Descripción', render: (m) => m.description ?? '—' },
    {
      key: 'amount',
      header: 'Importe',
      render: (m) => (
        <span className={`font-medium ${m.type === 'income' ? 'text-success' : 'text-danger'}`}>
          {m.type === 'income' ? '+' : '-'}{formatMoney(m.amount, m.currency)}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft size={16} /> Volver a cajas
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text">{register.name}</h1>
          <p className="text-sm text-text-secondary">{register.currency}</p>
        </div>
        {can('finance', 'edit') && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" size="md" onClick={() => setOpenSessionOpen(true)}>
              Abrir sesión
            </Button>
            <Button variant="secondary" size="md" onClick={() => setCloseSessionOpen(true)}>
              Cerrar sesión (arqueo)
            </Button>
            <Button variant="primary" size="md" onClick={() => setMovementOpen(true)}>
              <Plus size={16} /> Movimiento manual
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : isError ? (
        <ErrorState message="No pudimos cargar el saldo." />
      ) : detail ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <KPICard
            label="Saldo actual"
            value={formatMoney(String(detail.balance), register.currency)}
          />
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-text">Movimientos</h2>
        <DataTable
          columns={movColumns}
          rows={movements ?? []}
          rowKey={(m) => m.id}
          loading={loadingMv}
          emptyState={<EmptyState title="Sin movimientos" description="No hay movimientos registrados en esta caja." />}
        />
      </section>

      {movementOpen && (
        <CashMovementForm
          register={register}
          onClose={() => setMovementOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['cash-movements', register.id] })
            qc.invalidateQueries({ queryKey: ['cash-register', register.id] })
            setMovementOpen(false)
          }}
        />
      )}

      {openSessionOpen && (
        <OpenSessionForm
          register={register}
          onClose={() => setOpenSessionOpen(false)}
          onSaved={() => {
            toast.success('Sesión abierta')
            qc.invalidateQueries({ queryKey: ['cash-register', register.id] })
            setOpenSessionOpen(false)
          }}
        />
      )}

      {closeSessionOpen && (
        <CloseSessionForm
          register={register}
          balance={String(detail?.balance ?? '0')}
          onClose={() => setCloseSessionOpen(false)}
          onSaved={() => {
            toast.success('Sesión cerrada')
            qc.invalidateQueries({ queryKey: ['cash-register', register.id] })
            setCloseSessionOpen(false)
          }}
        />
      )}
    </div>
  )
}

// ─── Forms ────────────────────────────────────────────────────────────────────

function CashRegisterForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useUIStore((s) => s.toast)
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('ARS')

  const save = useMutation({
    mutationFn: () => financeApi.cashRegisters.create({ name, currency }),
    onSuccess: () => { toast.success('Caja creada'); onSaved() },
    onError: () => toast.error('No se pudo crear la caja'),
  })

  return (
    <SlideOver open onClose={onClose} title="Nueva caja">
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
        <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
        <Select
          label="Moneda"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          options={[{ value: 'ARS', label: 'ARS — Peso' }, { value: 'USD', label: 'USD — Dólar' }]}
        />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" size="md" loading={save.isPending}>Crear</Button>
        </div>
      </form>
    </SlideOver>
  )
}

function CashMovementForm({ register, onClose, onSaved }: { register: CashRegister; onClose: () => void; onSaved: () => void }) {
  const toast = useUIStore((s) => s.toast)
  const [type, setType] = useState<'income' | 'expense'>('income')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')

  const save = useMutation({
    mutationFn: () =>
      financeApi.cashRegisters.createMovement(register.id, {
        type,
        amount,
        currency: register.currency,
        description: description || undefined,
      }),
    onSuccess: () => { toast.success('Movimiento registrado'); onSaved() },
    onError: () => toast.error('No se pudo registrar'),
  })

  return (
    <SlideOver open onClose={onClose} title="Movimiento manual">
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
        <Select
          label="Tipo"
          value={type}
          onChange={(e) => setType(e.target.value as 'income' | 'expense')}
          options={[{ value: 'income', label: 'Ingreso' }, { value: 'expense', label: 'Egreso' }]}
        />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text">Importe</label>
          <MoneyInput currency={register.currency} value={amount} onChange={setAmount} />
        </div>
        <Input label="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" size="md" loading={save.isPending} disabled={!amount}>Registrar</Button>
        </div>
      </form>
    </SlideOver>
  )
}

function OpenSessionForm({ register, onClose, onSaved }: { register: CashRegister; onClose: () => void; onSaved: () => void }) {
  const toast = useUIStore((s) => s.toast)
  const [opening, setOpening] = useState('0')

  const save = useMutation({
    mutationFn: () => financeApi.cashRegisters.openSession(register.id, opening),
    onSuccess: () => onSaved(),
    onError: () => toast.error('No se pudo abrir la sesión'),
  })

  return (
    <SlideOver open onClose={onClose} title={`Abrir sesión — ${register.name}`}>
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text">Saldo de apertura</label>
          <MoneyInput currency={register.currency} value={opening} onChange={setOpening} />
        </div>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" size="md" loading={save.isPending}>Abrir sesión</Button>
        </div>
      </form>
    </SlideOver>
  )
}

function CloseSessionForm({ register, balance, onClose, onSaved }: { register: CashRegister; balance: string; onClose: () => void; onSaved: () => void }) {
  const toast = useUIStore((s) => s.toast)
  const [declared, setDeclared] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const diff = declared
    ? (parseFloat(declared) - parseFloat(balance)).toFixed(2)
    : null

  const save = useMutation({
    mutationFn: () => financeApi.cashRegisters.closeSession(register.id, declared),
    onSuccess: () => onSaved(),
    onError: () => toast.error('No se pudo cerrar la sesión'),
  })

  return (
    <SlideOver open onClose={onClose} title={`Cerrar sesión (arqueo) — ${register.name}`}>
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-border bg-surface p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-text-secondary">Saldo calculado</span>
            <span className="font-medium">{formatMoney(balance, register.currency)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text">Saldo declarado en caja</label>
          <MoneyInput currency={register.currency} value={declared} onChange={setDeclared} />
        </div>

        {diff !== null && (
          <div className={`rounded-xl border p-3 text-sm ${parseFloat(diff) === 0 ? 'border-success/30 bg-success/10 text-success' : 'border-danger/30 bg-danger/10 text-danger'}`}>
            Diferencia: {parseFloat(diff) >= 0 ? '+' : ''}{formatMoney(diff, register.currency)}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            size="md"
            disabled={!declared}
            onClick={() => setConfirmOpen(true)}
          >
            Cerrar sesión
          </Button>
        </div>
      </div>

      {confirmOpen && (
        <ConfirmModal
          title="Cerrar sesión de caja"
          message={`¿Confirmás el cierre de la sesión con saldo declarado ${formatMoney(declared, register.currency)}${diff !== null ? ` (diferencia: ${parseFloat(diff) >= 0 ? '+' : ''}${formatMoney(diff, register.currency)})` : ''}?`}
          confirmLabel="Cerrar sesión"
          variant="primary"
          loading={save.isPending}
          onConfirm={() => save.mutate()}
          onClose={() => setConfirmOpen(false)}
        />
      )}
    </SlideOver>
  )
}

function TransferForm({ registers, onClose, onSaved }: { registers: CashRegister[]; onClose: () => void; onSaved: () => void }) {
  const toast = useUIStore((s) => s.toast)
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')

  const fromReg = registers.find((r) => r.id === fromId)

  const save = useMutation({
    mutationFn: () =>
      financeApi.cashRegisters.transfer({
        from_cash_id: fromId,
        to_cash_id: toId || undefined,
        amount,
        currency: fromReg?.currency ?? 'ARS',
        description: description || undefined,
      }),
    onSuccess: () => onSaved(),
    onError: () => toast.error('No se pudo realizar la transferencia'),
  })

  const regOptions = registers.map((r) => ({ value: r.id, label: r.name }))

  return (
    <SlideOver open onClose={onClose} title="Transferir entre cajas">
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
        <Select
          label="Caja origen"
          value={fromId}
          onChange={(e) => setFromId(e.target.value)}
          options={[{ value: '', label: 'Seleccioná una caja' }, ...regOptions]}
        />
        <Select
          label="Caja destino"
          value={toId}
          onChange={(e) => setToId(e.target.value)}
          options={[{ value: '', label: 'Seleccioná una caja' }, ...regOptions.filter((r) => r.value !== fromId)]}
        />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text">Importe</label>
          <MoneyInput currency={fromReg?.currency ?? 'ARS'} value={amount} onChange={setAmount} />
        </div>
        <Input label="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" size="md" loading={save.isPending} disabled={!fromId || !toId || !amount}>Transferir</Button>
        </div>
      </form>
    </SlideOver>
  )
}
