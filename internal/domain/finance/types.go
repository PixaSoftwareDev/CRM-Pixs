package finance

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// InvoiceStatus is the lifecycle status of an issued invoice.
type InvoiceStatus string

// Invoice statuses.
const (
	InvoiceStatusDraft         InvoiceStatus = "draft"
	InvoiceStatusIssued        InvoiceStatus = "issued"
	InvoiceStatusPartiallyPaid InvoiceStatus = "partially_paid"
	InvoiceStatusPaid          InvoiceStatus = "paid"
	InvoiceStatusOverdue       InvoiceStatus = "overdue"
	InvoiceStatusVoid          InvoiceStatus = "void"
)

// ParseInvoiceStatus validates and parses an invoice status string.
func ParseInvoiceStatus(s string) (InvoiceStatus, error) {
	switch InvoiceStatus(s) {
	case InvoiceStatusDraft, InvoiceStatusIssued, InvoiceStatusPartiallyPaid,
		InvoiceStatusPaid, InvoiceStatusOverdue, InvoiceStatusVoid:
		return InvoiceStatus(s), nil
	}
	return "", ErrInvalidInvoiceStatus
}

// ValidInvoiceType reports whether the letter is a valid AFIP invoice type.
func ValidInvoiceType(t string) bool {
	switch t {
	case "A", "B", "C", "M":
		return true
	}
	return false
}

// Invoice is an issued invoice (factura emitida) with line items and totals.
type Invoice struct {
	ID                 uuid.UUID       `json:"id"`
	CompanyID          uuid.UUID       `json:"company_id"`
	IdempotencyKey     uuid.UUID       `json:"idempotency_key"`
	InvoiceType        string          `json:"invoice_type"`
	SalePoint          int16           `json:"sale_point"`
	Number             *int32          `json:"number"`
	ContactID          uuid.UUID       `json:"contact_id"`
	IssueDate          time.Time       `json:"issue_date"`
	DueDate            *time.Time      `json:"due_date"`
	PaymentConditionID *uuid.UUID      `json:"payment_condition_id"`
	Currency           string          `json:"currency"`
	ExchangeRate       decimal.Decimal `json:"exchange_rate"`
	ExchangeRateDate   time.Time       `json:"exchange_rate_date"`
	Status             InvoiceStatus   `json:"status"`
	NetAmount          decimal.Decimal `json:"net_amount"`
	TaxAmount          decimal.Decimal `json:"tax_amount"`
	TotalAmount        decimal.Decimal `json:"total_amount"`
	PaidAmount         decimal.Decimal `json:"paid_amount"`
	ProjectID          *uuid.UUID      `json:"project_id"`
	QuoteID            *uuid.UUID      `json:"quote_id"`
	Notes              *string         `json:"notes"`
	Items              []*InvoiceItem  `json:"items,omitempty"`
	Taxes              []*InvoiceTax   `json:"taxes,omitempty"`
	CreatedAt          time.Time       `json:"created_at"`
	UpdatedAt          time.Time       `json:"updated_at"`
	DeletedAt          *time.Time      `json:"deleted_at,omitempty"`
}

// InvoiceItem is a single line on an invoice.
type InvoiceItem struct {
	ID          uuid.UUID       `json:"id"`
	InvoiceID   uuid.UUID       `json:"invoice_id"`
	ProductID   *uuid.UUID      `json:"product_id"`
	Description string          `json:"description"`
	Quantity    decimal.Decimal `json:"quantity"`
	UnitPrice   decimal.Decimal `json:"unit_price"`
	DiscountPct decimal.Decimal `json:"discount_pct"`
	VATRateID   *uuid.UUID      `json:"vat_rate_id"`
	LineNet     decimal.Decimal `json:"line_net"`
	LineTax     decimal.Decimal `json:"line_tax"`
	LineTotal   decimal.Decimal `json:"line_total"`
	OrderPos    *int16          `json:"order_pos"`
}

// InvoiceTax is an aggregated tax line on an invoice.
type InvoiceTax struct {
	ID         uuid.UUID       `json:"id"`
	InvoiceID  uuid.UUID       `json:"invoice_id"`
	TaxType    string          `json:"tax_type"`
	RatePct    decimal.Decimal `json:"rate_pct"`
	BaseAmount decimal.Decimal `json:"base_amount"`
	TaxAmount  decimal.Decimal `json:"tax_amount"`
}

// Receipt is a customer payment receipt (recibo).
type Receipt struct {
	ID              uuid.UUID        `json:"id"`
	CompanyID       uuid.UUID        `json:"company_id"`
	ContactID       uuid.UUID        `json:"contact_id"`
	Date            time.Time        `json:"date"`
	Number          int32            `json:"number"`
	Currency        string           `json:"currency"`
	ExchangeRate    decimal.Decimal  `json:"exchange_rate"`
	TotalAmount     decimal.Decimal  `json:"total_amount"`
	OnAccountAmount decimal.Decimal  `json:"on_account_amount"`
	Notes           *string          `json:"notes"`
	CreatedBy       uuid.UUID        `json:"created_by"`
	CreatedAt       time.Time        `json:"created_at"`
	PaymentMethods  []*PaymentMethod `json:"payment_methods,omitempty"`
	Applications    []*Application   `json:"applications,omitempty"`
}

// PaymentMethod is one method used in a receipt or payment order.
type PaymentMethod struct {
	ID             uuid.UUID       `json:"id"`
	MethodType     string          `json:"method_type"`
	CashRegisterID *uuid.UUID      `json:"cash_register_id"`
	BankAccountID  *uuid.UUID      `json:"bank_account_id"`
	Amount         decimal.Decimal `json:"amount"`
	Currency       *string         `json:"currency"`
	CheckNumber    *string         `json:"check_number"`
	CheckDate      *time.Time      `json:"check_date"`
}

// Application is the application of a receipt/payment order to an invoice.
type Application struct {
	ID        uuid.UUID       `json:"id"`
	InvoiceID uuid.UUID       `json:"invoice_id"`
	Amount    decimal.Decimal `json:"amount"`
}

// PaymentOrder is a supplier payment order (orden de pago).
type PaymentOrder struct {
	ID             uuid.UUID        `json:"id"`
	CompanyID      uuid.UUID        `json:"company_id"`
	SupplierID     uuid.UUID        `json:"supplier_id"`
	Date           time.Time        `json:"date"`
	Number         int32            `json:"number"`
	Currency       string           `json:"currency"`
	ExchangeRate   decimal.Decimal  `json:"exchange_rate"`
	TotalAmount    decimal.Decimal  `json:"total_amount"`
	Notes          *string          `json:"notes"`
	CreatedBy      uuid.UUID        `json:"created_by"`
	CreatedAt      time.Time        `json:"created_at"`
	PaymentMethods []*PaymentMethod `json:"payment_methods,omitempty"`
	Applications   []*Application   `json:"applications,omitempty"`
}

// InvoiceReceived is a supplier invoice (factura recibida).
type InvoiceReceived struct {
	ID          uuid.UUID       `json:"id"`
	CompanyID   uuid.UUID       `json:"company_id"`
	SupplierID  uuid.UUID       `json:"supplier_id"`
	InvoiceType *string         `json:"invoice_type"`
	SalePoint   *int16          `json:"sale_point"`
	Number      *int32          `json:"number"`
	IssueDate   *time.Time      `json:"issue_date"`
	DueDate     *time.Time      `json:"due_date"`
	Currency    *string         `json:"currency"`
	NetAmount   decimal.Decimal `json:"net_amount"`
	TaxAmount   decimal.Decimal `json:"tax_amount"`
	TotalAmount decimal.Decimal `json:"total_amount"`
	PaidAmount  decimal.Decimal `json:"paid_amount"`
	Status      string          `json:"status"`
	ProjectID   *uuid.UUID      `json:"project_id"`
	Notes       *string         `json:"notes"`
	CreatedAt   time.Time       `json:"created_at"`
}

// CashRegister is a physical or logical cash register (caja).
type CashRegister struct {
	ID            uuid.UUID  `json:"id"`
	CompanyID     uuid.UUID  `json:"company_id"`
	Name          string     `json:"name"`
	Currency      string     `json:"currency"`
	ResponsibleID *uuid.UUID `json:"responsible_id"`
	IsActive      bool       `json:"is_active"`
	CreatedAt     time.Time  `json:"created_at"`
}

// CashSession is an open/close cycle of a cash register (arqueo).
type CashSession struct {
	ID                       uuid.UUID        `json:"id"`
	CashRegisterID           uuid.UUID        `json:"cash_register_id"`
	OpenedBy                 uuid.UUID        `json:"opened_by"`
	OpenedAt                 time.Time        `json:"opened_at"`
	ClosedBy                 *uuid.UUID       `json:"closed_by"`
	ClosedAt                 *time.Time       `json:"closed_at"`
	OpeningBalance           decimal.Decimal  `json:"opening_balance"`
	DeclaredClosingBalance   *decimal.Decimal `json:"declared_closing_balance"`
	CalculatedClosingBalance *decimal.Decimal `json:"calculated_closing_balance"`
	Difference               *decimal.Decimal `json:"difference"`
	Status                   string           `json:"status"`
}

// CashMovement is a cash inflow/outflow.
type CashMovement struct {
	ID             uuid.UUID       `json:"id"`
	CompanyID      uuid.UUID       `json:"company_id"`
	CashRegisterID uuid.UUID       `json:"cash_register_id"`
	SessionID      *uuid.UUID      `json:"session_id"`
	Type           string          `json:"type"`
	Amount         decimal.Decimal `json:"amount"`
	Currency       string          `json:"currency"`
	Description    *string         `json:"description"`
	ReferenceType  *string         `json:"reference_type"`
	ReferenceID    *uuid.UUID      `json:"reference_id"`
	CreatedBy      uuid.UUID       `json:"created_by"`
	CreatedAt      time.Time       `json:"created_at"`
}

// BankAccount is the company's own bank account.
type BankAccount struct {
	ID            uuid.UUID       `json:"id"`
	CompanyID     uuid.UUID       `json:"company_id"`
	BankName      string          `json:"bank_name"`
	AccountNumber *string         `json:"account_number"`
	CBU           *string         `json:"cbu"`
	Alias         *string         `json:"alias"`
	Currency      string          `json:"currency"`
	AccountHolder *string         `json:"account_holder"`
	BookBalance   decimal.Decimal `json:"book_balance"`
	IsActive      bool            `json:"is_active"`
	CreatedAt     time.Time       `json:"created_at"`
}

// BankMovement is a bank account inflow/outflow.
type BankMovement struct {
	ID            uuid.UUID       `json:"id"`
	CompanyID     uuid.UUID       `json:"company_id"`
	BankAccountID uuid.UUID       `json:"bank_account_id"`
	Type          string          `json:"type"`
	Amount        decimal.Decimal `json:"amount"`
	Currency      string          `json:"currency"`
	Description   *string         `json:"description"`
	ReferenceType *string         `json:"reference_type"`
	ReferenceID   *uuid.UUID      `json:"reference_id"`
	Reconciled    bool            `json:"reconciled"`
	ValueDate     time.Time       `json:"value_date"`
	CreatedBy     uuid.UUID       `json:"created_by"`
	CreatedAt     time.Time       `json:"created_at"`
}

// ExpenseStatus is the approval status of an expense.
type ExpenseStatus string

// Expense statuses.
const (
	ExpenseStatusPendingApproval ExpenseStatus = "pending_approval"
	ExpenseStatusApproved        ExpenseStatus = "approved"
	ExpenseStatusRejected        ExpenseStatus = "rejected"
)

// ParseExpenseStatus validates and parses an expense status string.
func ParseExpenseStatus(s string) (ExpenseStatus, error) {
	switch ExpenseStatus(s) {
	case ExpenseStatusPendingApproval, ExpenseStatusApproved, ExpenseStatusRejected:
		return ExpenseStatus(s), nil
	}
	return "", ErrInvalidExpenseStatus
}

// Expense is a recorded business expense.
type Expense struct {
	ID                  uuid.UUID       `json:"id"`
	CompanyID           uuid.UUID       `json:"company_id"`
	Date                time.Time       `json:"date"`
	CategoryID          uuid.UUID       `json:"category_id"`
	Description         string          `json:"description"`
	Amount              decimal.Decimal `json:"amount"`
	Currency            *string         `json:"currency"`
	PaidByUserID        *uuid.UUID      `json:"paid_by_user_id"`
	PaidByCashID        *uuid.UUID      `json:"paid_by_cash_id"`
	PaidByBankID        *uuid.UUID      `json:"paid_by_bank_id"`
	ProjectID           *uuid.UUID      `json:"project_id"`
	Status              ExpenseStatus   `json:"status"`
	ApproverID          *uuid.UUID      `json:"approver_id"`
	ReimbursementStatus string          `json:"reimbursement_status"`
	CreatedAt           time.Time       `json:"created_at"`
}

// RecurringPayment is a template for recurring obligations.
type RecurringPayment struct {
	ID            uuid.UUID        `json:"id"`
	CompanyID     uuid.UUID        `json:"company_id"`
	SupplierID    *uuid.UUID       `json:"supplier_id"`
	Description   string           `json:"description"`
	Amount        *decimal.Decimal `json:"amount"`
	Currency      *string          `json:"currency"`
	Frequency     string           `json:"frequency"`
	DueDay        *int16           `json:"due_day"`
	NextDueDate   *time.Time       `json:"next_due_date"`
	PaymentMethod *string          `json:"payment_method"`
	CategoryID    *uuid.UUID       `json:"category_id"`
	Status        string           `json:"status"`
	CreatedAt     time.Time        `json:"created_at"`
}

// PaymentObligation is a scheduled future payment (calendario de pagos).
type PaymentObligation struct {
	ID             uuid.UUID       `json:"id"`
	CompanyID      uuid.UUID       `json:"company_id"`
	SourceType     string          `json:"source_type"`
	SourceID       *uuid.UUID      `json:"source_id"`
	Description    string          `json:"description"`
	Amount         decimal.Decimal `json:"amount"`
	Currency       *string         `json:"currency"`
	DueDate        time.Time       `json:"due_date"`
	Status         string          `json:"status"`
	PaidAt         *time.Time      `json:"paid_at"`
	PaymentOrderID *uuid.UUID      `json:"payment_order_id"`
	CreatedAt      time.Time       `json:"created_at"`
}

// AdvanceNextDue returns the next due date for a recurring payment frequency.
func AdvanceNextDue(current time.Time, frequency string) time.Time {
	switch frequency {
	case "monthly":
		return current.AddDate(0, 1, 0)
	case "bimonthly":
		return current.AddDate(0, 2, 0)
	case "quarterly":
		return current.AddDate(0, 3, 0)
	case "annual":
		return current.AddDate(1, 0, 0)
	default:
		return current.AddDate(0, 1, 0)
	}
}
