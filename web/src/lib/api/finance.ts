import { api } from './client'

// ─── Catalogs ────────────────────────────────────────────────────────────────

export interface VATRate {
  id: string
  company_id: string
  name: string
  rate_pct: string
  is_active: boolean
  created_at: string
}

export interface PaymentCondition {
  id: string
  company_id: string
  name: string
  days: number
  is_active: boolean
  created_at: string
}

export interface ExpenseCategory {
  id: string
  company_id: string
  name: string
  is_active: boolean
  created_at: string
}

export interface Currency {
  code: string
  name: string
  symbol: string
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export interface InvoiceItem {
  id: string
  invoice_id: string
  product_id?: string
  description: string
  quantity: string
  unit_price: string
  discount_pct: string
  vat_rate_id?: string
  line_net: string
  line_tax: string
  line_total: string
  order_pos?: number
}

export interface InvoiceTax {
  id: string
  invoice_id: string
  tax_type: string
  rate_pct: string
  base_amount: string
  tax_amount: string
}

export interface Invoice {
  id: string
  company_id: string
  idempotency_key: string
  invoice_type: string
  sale_point: number
  number?: number
  contact_id: string
  issue_date: string
  due_date?: string
  payment_condition_id?: string
  currency: string
  exchange_rate: string
  exchange_rate_date: string
  status: string
  net_amount: string
  tax_amount: string
  total_amount: string
  paid_amount: string
  project_id?: string
  quote_id?: string
  notes?: string
  items?: InvoiceItem[]
  taxes?: InvoiceTax[]
  created_at: string
  updated_at: string
}

export type InvoiceItemInput = {
  product_id?: string
  description: string
  quantity: string
  unit_price: string
  discount_pct?: string
  vat_rate_pct?: string
  vat_rate_id?: string
  order_pos?: number
}

export type CreateInvoiceInput = {
  invoice_type: string
  sale_point?: number
  contact_id: string
  issue_date: string
  due_date?: string
  payment_condition_id?: string
  currency: string
  exchange_rate?: string
  exchange_rate_date?: string
  project_id?: string
  quote_id?: string
  notes?: string
  items: InvoiceItemInput[]
}

// ─── Invoices Received ───────────────────────────────────────────────────────

export interface InvoiceReceived {
  id: string
  company_id: string
  supplier_id: string
  invoice_type?: string
  sale_point?: number
  number?: number
  issue_date?: string
  due_date?: string
  currency?: string
  net_amount: string
  tax_amount: string
  total_amount: string
  paid_amount: string
  status: string
  project_id?: string
  notes?: string
  created_at: string
}

export type CreateInvoiceReceivedInput = {
  supplier_id: string
  invoice_type?: string
  sale_point?: number
  number?: number
  issue_date?: string
  due_date?: string
  currency?: string
  exchange_rate?: string
  net_amount?: string
  tax_amount?: string
  total_amount: string
  project_id?: string
  notes?: string
}

// ─── Receipts ────────────────────────────────────────────────────────────────

export interface PaymentMethod {
  id: string
  method_type: string
  cash_register_id?: string
  bank_account_id?: string
  amount: string
  currency?: string
  check_number?: string
  check_date?: string
}

export interface Application {
  id: string
  invoice_id: string
  amount: string
}

export interface Receipt {
  id: string
  company_id: string
  contact_id: string
  date: string
  number: number
  currency: string
  exchange_rate: string
  total_amount: string
  on_account_amount: string
  notes?: string
  created_by: string
  created_at: string
  payment_methods?: PaymentMethod[]
  applications?: Application[]
}

export type PaymentMethodInput = {
  method_type: string
  cash_register_id?: string
  bank_account_id?: string
  amount: string
  currency?: string
  check_number?: string
  check_date?: string
}

export type ApplicationInput = {
  invoice_id: string
  amount: string
}

export type CreateReceiptInput = {
  contact_id: string
  date: string
  currency: string
  exchange_rate?: string
  notes?: string
  payment_methods: PaymentMethodInput[]
  applications?: ApplicationInput[]
  recurring_frequency?: string
  recurring_due_day?: number
  recurring_description?: string
}

// ─── Payment Orders ──────────────────────────────────────────────────────────

export interface PaymentOrder {
  id: string
  company_id: string
  supplier_id: string
  date: string
  number: number
  currency: string
  exchange_rate: string
  total_amount: string
  notes?: string
  created_by: string
  created_at: string
  payment_methods?: PaymentMethod[]
  applications?: Application[]
}

export type POApplicationInput = {
  invoice_received_id: string
  amount: string
}

export type CreatePaymentOrderInput = {
  supplier_id: string
  date: string
  currency: string
  exchange_rate?: string
  notes?: string
  payment_methods: PaymentMethodInput[]
  applications?: POApplicationInput[]
}

// ─── Cash Registers ──────────────────────────────────────────────────────────

export interface CashRegister {
  id: string
  company_id: string
  name: string
  currency: string
  responsible_id?: string
  is_active: boolean
  created_at: string
}

export interface CashRegisterDetail {
  register: CashRegister
  balance: string
}

export interface CashSession {
  id: string
  cash_register_id: string
  opened_by: string
  opened_at: string
  closed_by?: string
  closed_at?: string
  opening_balance: string
  declared_closing_balance?: string
  calculated_closing_balance?: string
  difference?: string
  status: string
}

export interface CashMovement {
  id: string
  company_id: string
  cash_register_id: string
  session_id?: string
  type: string
  amount: string
  currency: string
  description?: string
  reference_type?: string
  reference_id?: string
  created_by: string
  created_at: string
}

// ─── Bank Accounts ───────────────────────────────────────────────────────────

export interface BankAccount {
  id: string
  company_id: string
  bank_name: string
  account_number?: string
  cbu?: string
  alias?: string
  currency: string
  account_holder?: string
  book_balance: string
  is_active: boolean
  created_at: string
}

export interface BankMovement {
  id: string
  company_id: string
  bank_account_id: string
  type: string
  amount: string
  currency: string
  description?: string
  reference_type?: string
  reference_id?: string
  reconciled: boolean
  value_date: string
  created_by: string
  created_at: string
}

// ─── Expenses ────────────────────────────────────────────────────────────────

export interface Expense {
  id: string
  company_id: string
  date: string
  category_id: string
  description: string
  amount: string
  currency?: string
  paid_by_user_id?: string
  paid_by_cash_id?: string
  paid_by_bank_id?: string
  project_id?: string
  status: string
  approver_id?: string
  reimbursement_status: string
  created_at: string
}

export type CreateExpenseInput = {
  date: string
  category_id: string
  description: string
  amount: string
  currency?: string
  paid_by_user_id?: string
  paid_by_cash_id?: string
  paid_by_bank_id?: string
  project_id?: string
  status?: string
  recurring_frequency?: string
  recurring_due_day?: number
}

// ─── Recurring Payments ──────────────────────────────────────────────────────

export interface RecurringPayment {
  id: string
  company_id: string
  supplier_id?: string
  description: string
  amount?: string
  currency?: string
  frequency: string
  due_day?: number
  next_due_date?: string
  payment_method?: string
  category_id?: string
  status: string
  created_at: string
}

export type RecurringInput = {
  supplier_id?: string
  description: string
  amount?: string
  currency?: string
  frequency: string
  due_day?: number
  next_due_date?: string
  payment_method?: string
  category_id?: string
  status?: string
}

// ─── Payment Calendar ────────────────────────────────────────────────────────

export interface PaymentObligation {
  id: string
  company_id: string
  source_type: string
  source_id?: string
  description: string
  amount: string
  currency?: string
  due_date: string
  status: string
  paid_at?: string
  payment_order_id?: string
  created_at: string
}

// ─── Cash Flow ───────────────────────────────────────────────────────────────

export interface Bucket {
  b_0_30: string
  b_31_60: string
  b_61_90: string
  b_90_plus: string
  total: string
}

export interface CashFlowProjection {
  currency: string
  scenario: string
  current_balance: string
  receivables_by_bucket: Bucket
  payables_by_bucket: Bucket
  net_flow_by_bucket: Bucket
  projected_balance: string
}

export interface ConsolidatedBalance {
  currency: string
  balance: string
}

// ─── API Methods ─────────────────────────────────────────────────────────────

export const financeApi = {
  catalogs: {
    vatRates: () => api.get<VATRate[]>('/finance/vat-rates'),
    paymentConditions: () => api.get<PaymentCondition[]>('/finance/payment-conditions'),
    expenseCategories: () => api.get<ExpenseCategory[]>('/finance/expense-categories'),
    currencies: () => api.get<Currency[]>('/finance/currencies'),
  },

  invoices: {
    list: (params?: { contact_id?: string; status?: string; from?: string; to?: string }) => {
      const qs = new URLSearchParams()
      if (params?.contact_id) qs.set('contact_id', params.contact_id)
      if (params?.status) qs.set('status', params.status)
      if (params?.from) qs.set('from', params.from)
      if (params?.to) qs.set('to', params.to)
      const q = qs.toString()
      return api.get<Invoice[]>(`/invoices${q ? '?' + q : ''}`)
    },
    get: (id: string) => api.get<Invoice>(`/invoices/${id}`),
    create: (body: CreateInvoiceInput) => api.post<Invoice>('/invoices', body),
    update: (id: string, body: CreateInvoiceInput) => api.put<Invoice>(`/invoices/${id}`, body),
    issue: (id: string, idempotencyKey: string) =>
      api.post<Invoice>(`/invoices/${id}/issue`, undefined, {
        headers: { 'X-Idempotency-Key': idempotencyKey },
      }),
    void: (id: string) => api.post<Invoice>(`/invoices/${id}/void`, undefined),
    delete: (id: string) => api.delete<void>(`/invoices/${id}`),
    items: (id: string) => api.get<InvoiceItem[]>(`/invoices/${id}/items`),
    taxes: (id: string) => api.get<InvoiceTax[]>(`/invoices/${id}/taxes`),
  },

  invoicesReceived: {
    list: (params?: { supplier_id?: string; status?: string }) => {
      const qs = new URLSearchParams()
      if (params?.supplier_id) qs.set('supplier_id', params.supplier_id)
      if (params?.status) qs.set('status', params.status)
      const q = qs.toString()
      return api.get<InvoiceReceived[]>(`/invoices-received${q ? '?' + q : ''}`)
    },
    get: (id: string) => api.get<InvoiceReceived>(`/invoices-received/${id}`),
    create: (body: CreateInvoiceReceivedInput) =>
      api.post<InvoiceReceived>('/invoices-received', body),
    update: (id: string, body: CreateInvoiceReceivedInput) =>
      api.put<InvoiceReceived>(`/invoices-received/${id}`, body),
    delete: (id: string) => api.delete<void>(`/invoices-received/${id}`),
  },

  receipts: {
    list: (params?: { contact_id?: string; from?: string; to?: string }) => {
      const qs = new URLSearchParams()
      if (params?.contact_id) qs.set('contact_id', params.contact_id)
      if (params?.from) qs.set('from', params.from)
      if (params?.to) qs.set('to', params.to)
      const q = qs.toString()
      return api.get<Receipt[]>(`/receipts${q ? '?' + q : ''}`)
    },
    get: (id: string) => api.get<Receipt>(`/receipts/${id}`),
    create: (body: CreateReceiptInput, idempotencyKey: string) =>
      api.post<Receipt>('/receipts', body, {
        headers: { 'X-Idempotency-Key': idempotencyKey },
      }),
    void: (id: string) => api.delete<void>(`/receipts/${id}`),
  },

  paymentOrders: {
    list: (params?: { supplier_id?: string; from?: string; to?: string }) => {
      const qs = new URLSearchParams()
      if (params?.supplier_id) qs.set('supplier_id', params.supplier_id)
      if (params?.from) qs.set('from', params.from)
      if (params?.to) qs.set('to', params.to)
      const q = qs.toString()
      return api.get<PaymentOrder[]>(`/payment-orders${q ? '?' + q : ''}`)
    },
    get: (id: string) => api.get<PaymentOrder>(`/payment-orders/${id}`),
    create: (body: CreatePaymentOrderInput, idempotencyKey: string) =>
      api.post<PaymentOrder>('/payment-orders', body, {
        headers: { 'X-Idempotency-Key': idempotencyKey },
      }),
    void: (id: string) => api.delete<void>(`/payment-orders/${id}`),
  },

  cashRegisters: {
    list: () => api.get<CashRegister[]>('/cash-registers'),
    get: (id: string) => api.get<CashRegisterDetail>(`/cash-registers/${id}`),
    create: (body: { name: string; currency: string; responsible_id?: string }) =>
      api.post<CashRegister>('/cash-registers', body),
    update: (
      id: string,
      body: { name: string; currency: string; responsible_id?: string; is_active?: boolean },
    ) => api.put<CashRegister>(`/cash-registers/${id}`, body),
    openSession: (id: string, opening_balance: string) =>
      api.post<CashSession>(`/cash-registers/${id}/open`, { opening_balance }),
    closeSession: (id: string, declared_closing_balance: string) =>
      api.post<CashSession>(`/cash-registers/${id}/close`, { declared_closing_balance }),
    movements: (id: string, params?: { from?: string; to?: string }) => {
      const qs = new URLSearchParams()
      if (params?.from) qs.set('from', params.from)
      if (params?.to) qs.set('to', params.to)
      const q = qs.toString()
      return api.get<CashMovement[]>(`/cash-registers/${id}/movements${q ? '?' + q : ''}`)
    },
    createMovement: (
      id: string,
      body: { type: string; amount: string; currency: string; description?: string },
    ) => api.post<CashMovement>(`/cash-registers/${id}/movements`, body),
    transfer: (body: {
      from_cash_id: string
      to_cash_id?: string
      to_bank_id?: string
      amount: string
      currency: string
      description?: string
    }) => api.post<void>('/cash-registers/transfer', body),
  },

  bankAccounts: {
    list: () => api.get<BankAccount[]>('/bank-accounts'),
    get: (id: string) => api.get<BankAccount>(`/bank-accounts/${id}`),
    create: (body: {
      bank_name: string
      account_number?: string
      cbu?: string
      alias?: string
      currency: string
      account_holder?: string
      initial_balance?: string
    }) => api.post<BankAccount>('/bank-accounts', body),
    update: (
      id: string,
      body: {
        bank_name: string
        account_number?: string
        cbu?: string
        alias?: string
        currency: string
        account_holder?: string
        initial_balance?: string
        is_active?: boolean
      },
    ) => api.put<BankAccount>(`/bank-accounts/${id}`, body),
    movements: (id: string, params?: { from?: string; to?: string }) => {
      const qs = new URLSearchParams()
      if (params?.from) qs.set('from', params.from)
      if (params?.to) qs.set('to', params.to)
      const q = qs.toString()
      return api.get<BankMovement[]>(`/bank-accounts/${id}/movements${q ? '?' + q : ''}`)
    },
    createMovement: (
      id: string,
      body: {
        type: string
        amount: string
        currency: string
        description?: string
        value_date?: string
      },
    ) => api.post<BankMovement>(`/bank-accounts/${id}/movements`, body),
    reconcile: (id: string, movement_ids: string[]) =>
      api.post<BankMovement[]>(`/bank-accounts/${id}/reconcile`, { movement_ids }),
  },

  expenses: {
    list: (params?: { category_id?: string; status?: string; from?: string; to?: string }) => {
      const qs = new URLSearchParams()
      if (params?.category_id) qs.set('category_id', params.category_id)
      if (params?.status) qs.set('status', params.status)
      if (params?.from) qs.set('from', params.from)
      if (params?.to) qs.set('to', params.to)
      const q = qs.toString()
      return api.get<Expense[]>(`/expenses${q ? '?' + q : ''}`)
    },
    get: (id: string) => api.get<Expense>(`/expenses/${id}`),
    create: (body: CreateExpenseInput) => api.post<Expense>('/expenses', body),
    approve: (id: string) => api.post<Expense>(`/expenses/${id}/approve`, undefined),
    reject: (id: string) => api.post<Expense>(`/expenses/${id}/reject`, undefined),
    delete: (id: string) => api.delete<void>(`/expenses/${id}`),
  },

  recurringPayments: {
    list: () => api.get<RecurringPayment[]>('/recurring-payments'),
    get: (id: string) => api.get<RecurringPayment>(`/recurring-payments/${id}`),
    create: (body: RecurringInput) => api.post<RecurringPayment>('/recurring-payments', body),
    update: (id: string, body: RecurringInput) =>
      api.put<RecurringPayment>(`/recurring-payments/${id}`, body),
    delete: (id: string) => api.delete<void>(`/recurring-payments/${id}`),
  },

  paymentCalendar: {
    list: (params?: {
      status?: string
      source_type?: string
      from?: string
      to?: string
    }) => {
      const qs = new URLSearchParams()
      if (params?.status) qs.set('status', params.status)
      if (params?.source_type) qs.set('source_type', params.source_type)
      if (params?.from) qs.set('from', params.from)
      if (params?.to) qs.set('to', params.to)
      const q = qs.toString()
      return api.get<PaymentObligation[]>(`/payment-calendar${q ? '?' + q : ''}`)
    },
    markPaid: (id: string, payment_order_id?: string) =>
      api.post<PaymentObligation>(`/payment-calendar/${id}/pay`, { payment_order_id }),
  },

  cashFlow: {
    projection: (params?: { days?: number; currency?: string; scenario?: string }) => {
      const qs = new URLSearchParams()
      if (params?.days) qs.set('days', String(params.days))
      if (params?.currency) qs.set('currency', params.currency)
      if (params?.scenario) qs.set('scenario', params.scenario)
      const q = qs.toString()
      return api.get<CashFlowProjection>(`/cash-flow${q ? '?' + q : ''}`)
    },
    consolidatedBalance: () => api.get<ConsolidatedBalance[]>('/consolidated-balance'),
    alerts: (days?: number) =>
      api.get<AlertsSummary>(`/alerts${days ? '?days=' + days : ''}`),
  },
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

export type AlertsOverdueInvoice = {
  id: string
  contact_name: string
  invoice_type: string
  number?: number
  due_date?: string
  currency: string
  remaining: string
  status: string
}

export type AlertsObligation = {
  id: string
  description: string
  due_date?: string
  currency: string
  amount: string
  source_type: string
}

export type AlertsRecurring = {
  id: string
  description: string
  next_due_date?: string
  currency: string
  amount: string
  frequency: string
}

export type AlertsSummary = {
  overdue_receivables: AlertsOverdueInvoice[]
  upcoming_obligations: AlertsObligation[]
  upcoming_recurring: AlertsRecurring[]
}
