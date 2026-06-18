import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, CheckSquare } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { MoneyInput } from '../../components/ui/MoneyInput'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { SlideOver } from '../../components/ui/SlideOver'
import { KPICard } from '../../components/ui/KPICard'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { useAuthStore } from '../../stores/auth'
import { useUIStore } from '../../stores/ui'
import { formatMoney, formatDate } from '../../lib/utils'
import { financeApi, type BankAccount, type BankMovement } from '../../lib/api/finance'

export function BancosPage() {
  const can = useAuthStore((s) => s.can)
  const [selected, setSelected] = useState<BankAccount | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const qc = useQueryClient()

  const { data: accounts, isLoading, isError, refetch } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => financeApi.bankAccounts.list(),
  })

  const columns: Column<BankAccount>[] = [
    {
      key: 'bank_name',
      header: 'Banco',
      render: (b) => <span className="font-medium text-text">{b.bank_name}</span>,
    },
    { key: 'alias', header: 'Alias / CBU', render: (b) => b.alias ?? b.cbu ?? '—' },
    { key: 'currency', header: 'Moneda', render: (b) => <StatusBadge label={b.currency} color="neutral" /> },
    {
      key: 'book_balance',
      header: 'Saldo libro',
      render: (b) => <span className="font-medium">{formatMoney(b.book_balance, b.currency)}</span>,
    },
    {
      key: 'is_active',
      header: 'Estado',
      render: (b) => (
        <StatusBadge label={b.is_active ? 'Activa' : 'Inactiva'} color={b.is_active ? 'success' : 'neutral'} />
      ),
    },
  ]

  if (selected) {
    return <BankAccountDetail account={selected} onBack={() => setSelected(null)} />
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-text">Cuentas bancarias</h1>
        {can('finance', 'create') && (
          <Button variant="primary" size="lg" onClick={() => setCreateOpen(true)}>
            <Plus size={20} /> Nueva cuenta
          </Button>
        )}
      </div>

      {isError ? (
        <ErrorState message="No pudimos cargar las cuentas bancarias." onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={accounts ?? []}
          rowKey={(b) => b.id}
          loading={isLoading}
          onRowClick={(b) => setSelected(b)}
          emptyState={
            <EmptyState
              title="Sin cuentas bancarias"
              description="Cargá tus cuentas bancarias para registrar movimientos y conciliar."
              action={
                can('finance', 'create')
                  ? { label: 'Nueva cuenta', onClick: () => setCreateOpen(true) }
                  : undefined
              }
            />
          }
        />
      )}

      {createOpen && (
        <BankAccountForm
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['bank-accounts'] })
            setCreateOpen(false)
          }}
        />
      )}
    </div>
  )
}

// ─── Account detail ───────────────────────────────────────────────────────────

function BankAccountDetail({ account, onBack }: { account: BankAccount; onBack: () => void }) {
  const can = useAuthStore((s) => s.can)
  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)
  const [movementOpen, setMovementOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const { data: movements, isLoading, isError, refetch } = useQuery({
    queryKey: ['bank-movements', account.id],
    queryFn: () => financeApi.bankAccounts.movements(account.id),
  })

  const reconcileMut = useMutation({
    mutationFn: () => financeApi.bankAccounts.reconcile(account.id, Array.from(selected)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-movements', account.id] })
      toast.success('Movimientos conciliados')
      setSelected(new Set())
    },
    onError: () => toast.error('No se pudo conciliar'),
  })

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const movColumns: Column<BankMovement>[] = [
    {
      key: 'select',
      header: '',
      render: (m) => (
        <input
          type="checkbox"
          className="h-4 w-4 accent-brand"
          checked={selected.has(m.id)}
          onChange={() => toggleSelect(m.id)}
          onClick={(e) => e.stopPropagation()}
          disabled={m.reconciled}
        />
      ),
    },
    { key: 'value_date', header: 'Fecha', render: (m) => formatDate(m.value_date) },
    {
      key: 'type',
      header: 'Tipo',
      render: (m) => (
        <StatusBadge
          label={m.type === 'credit' ? 'Crédito' : 'Débito'}
          color={m.type === 'credit' ? 'success' : 'danger'}
        />
      ),
    },
    { key: 'description', header: 'Descripción', render: (m) => m.description ?? '—' },
    {
      key: 'amount',
      header: 'Importe',
      render: (m) => (
        <span className={`font-medium ${m.type === 'credit' ? 'text-success' : 'text-danger'}`}>
          {m.type === 'credit' ? '+' : '-'}{formatMoney(m.amount, m.currency)}
        </span>
      ),
    },
    {
      key: 'reconciled',
      header: 'Conciliado',
      render: (m) => (
        <StatusBadge label={m.reconciled ? 'Sí' : 'No'} color={m.reconciled ? 'success' : 'neutral'} />
      ),
    },
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-text-secondary hover:text-text">
        <ArrowLeft size={16} /> Volver a cuentas
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text">{account.bank_name}</h1>
          <p className="text-sm text-text-secondary">{account.alias ?? account.cbu ?? ''} · {account.currency}</p>
        </div>
        {can('finance', 'edit') && (
          <div className="flex gap-2">
            {selected.size > 0 && (
              <Button variant="secondary" size="md" loading={reconcileMut.isPending} onClick={() => reconcileMut.mutate()}>
                <CheckSquare size={16} /> Conciliar ({selected.size})
              </Button>
            )}
            <Button variant="primary" size="md" onClick={() => setMovementOpen(true)}>
              <Plus size={16} /> Movimiento
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KPICard label="Saldo en libro" value={formatMoney(account.book_balance, account.currency)} />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-text">Movimientos</h2>
        {isError ? (
          <ErrorState message="No pudimos cargar los movimientos." onRetry={() => refetch()} />
        ) : (
          <DataTable
            columns={movColumns}
            rows={movements ?? []}
            rowKey={(m) => m.id}
            loading={isLoading}
            emptyState={<EmptyState title="Sin movimientos" description="No hay movimientos en esta cuenta." />}
          />
        )}
      </section>

      {movementOpen && (
        <BankMovementForm
          account={account}
          onClose={() => setMovementOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['bank-movements', account.id] })
            qc.invalidateQueries({ queryKey: ['bank-accounts'] })
            setMovementOpen(false)
          }}
        />
      )}
    </div>
  )
}

// ─── Forms ────────────────────────────────────────────────────────────────────

function BankAccountForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useUIStore((s) => s.toast)
  const [bankName, setBankName] = useState('')
  const [alias, setAlias] = useState('')
  const [cbu, setCbu] = useState('')
  const [currency, setCurrency] = useState('ARS')
  const [accountHolder, setAccountHolder] = useState('')
  const [initialBalance, setInitialBalance] = useState('0')

  const save = useMutation({
    mutationFn: () =>
      financeApi.bankAccounts.create({
        bank_name: bankName,
        alias: alias || undefined,
        cbu: cbu || undefined,
        currency,
        account_holder: accountHolder || undefined,
        initial_balance: initialBalance || '0',
      }),
    onSuccess: () => { toast.success('Cuenta creada'); onSaved() },
    onError: () => toast.error('No se pudo crear la cuenta'),
  })

  return (
    <SlideOver open onClose={onClose} title="Nueva cuenta bancaria">
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (bankName) save.mutate() }}>
        <Input label="Banco" value={bankName} onChange={(e) => setBankName(e.target.value)} required />
        <Input label="Alias" value={alias} onChange={(e) => setAlias(e.target.value)} />
        <Input label="CBU" value={cbu} onChange={(e) => setCbu(e.target.value)} />
        <Input label="Titular" value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} />
        <Select
          label="Moneda"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          options={[{ value: 'ARS', label: 'ARS — Peso' }, { value: 'USD', label: 'USD — Dólar' }]}
        />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text">Saldo inicial</label>
          <MoneyInput currency={currency} value={initialBalance} onChange={setInitialBalance} />
        </div>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" size="md" loading={save.isPending}>Crear</Button>
        </div>
      </form>
    </SlideOver>
  )
}

function BankMovementForm({ account, onClose, onSaved }: { account: BankAccount; onClose: () => void; onSaved: () => void }) {
  const toast = useUIStore((s) => s.toast)
  const [type, setType] = useState<'credit' | 'debit'>('credit')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [valueDate, setValueDate] = useState(new Date().toISOString().slice(0, 10))

  const save = useMutation({
    mutationFn: () =>
      financeApi.bankAccounts.createMovement(account.id, {
        type,
        amount,
        currency: account.currency,
        description: description || undefined,
        value_date: valueDate,
      }),
    onSuccess: () => { toast.success('Movimiento registrado'); onSaved() },
    onError: () => toast.error('No se pudo registrar'),
  })

  return (
    <SlideOver open onClose={onClose} title="Nuevo movimiento bancario">
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
        <Select
          label="Tipo"
          value={type}
          onChange={(e) => setType(e.target.value as 'credit' | 'debit')}
          options={[{ value: 'credit', label: 'Crédito (ingreso)' }, { value: 'debit', label: 'Débito (egreso)' }]}
        />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text">Importe</label>
          <MoneyInput currency={account.currency} value={amount} onChange={setAmount} />
        </div>
        <Input label="Fecha valor" type="date" value={valueDate} onChange={(e) => setValueDate(e.target.value)} />
        <Input label="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" size="md" loading={save.isPending} disabled={!amount}>Registrar</Button>
        </div>
      </form>
    </SlideOver>
  )
}
