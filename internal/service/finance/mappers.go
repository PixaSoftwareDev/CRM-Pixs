package finance

import (
	domain "pixs/internal/domain/finance"
	sqlcgen "pixs/internal/repository/sqlc"
	"pixs/internal/service/internal/pgconv"
)

func invoiceFromRow(r sqlcgen.InvoicesIssued) *domain.Invoice {
	inv := &domain.Invoice{
		ID:                 r.ID,
		CompanyID:          r.CompanyID,
		IdempotencyKey:     r.IdempotencyKey,
		InvoiceType:        r.InvoiceType,
		SalePoint:          r.SalePoint,
		Number:             r.Number,
		ContactID:          r.ContactID,
		IssueDate:          r.IssueDate.Time,
		DueDate:            pgconv.TimePtr(r.DueDate),
		PaymentConditionID: pgconv.UUIDPtr(r.PaymentConditionID),
		Currency:           r.Currency,
		ExchangeRate:       pgconv.NumericToDecimalZero(r.ExchangeRate),
		ExchangeRateDate:   r.ExchangeRateDate.Time,
		Status:             domain.InvoiceStatus(r.Status),
		NetAmount:          pgconv.NumericToDecimalZero(r.NetAmount),
		TaxAmount:          pgconv.NumericToDecimalZero(r.TaxAmount),
		TotalAmount:        pgconv.NumericToDecimalZero(r.TotalAmount),
		PaidAmount:         pgconv.NumericToDecimalZero(r.PaidAmount),
		ProjectID:          pgconv.UUIDPtr(r.ProjectID),
		QuoteID:            pgconv.UUIDPtr(r.QuoteID),
		Notes:              r.Notes,
		CreatedAt:          r.CreatedAt.Time,
		UpdatedAt:          r.UpdatedAt.Time,
		DeletedAt:          pgconv.TimestamptzPtr(r.DeletedAt),
	}
	return inv
}

func invoiceItemFromRow(r sqlcgen.InvoiceItem) *domain.InvoiceItem {
	return &domain.InvoiceItem{
		ID:          r.ID,
		InvoiceID:   r.InvoiceID,
		ProductID:   pgconv.UUIDPtr(r.ProductID),
		Description: r.Description,
		Quantity:    pgconv.NumericToDecimalZero(r.Quantity),
		UnitPrice:   pgconv.NumericToDecimalZero(r.UnitPrice),
		DiscountPct: pgconv.NumericToDecimalZero(r.DiscountPct),
		VATRateID:   pgconv.UUIDPtr(r.VatRateID),
		LineNet:     pgconv.NumericToDecimalZero(r.LineNet),
		LineTax:     pgconv.NumericToDecimalZero(r.LineTax),
		LineTotal:   pgconv.NumericToDecimalZero(r.LineTotal),
		OrderPos:    r.OrderPos,
	}
}

func invoiceTaxFromRow(r sqlcgen.InvoiceTax) *domain.InvoiceTax {
	return &domain.InvoiceTax{
		ID:         r.ID,
		InvoiceID:  r.InvoiceID,
		TaxType:    r.TaxType,
		RatePct:    pgconv.NumericToDecimalZero(r.RatePct),
		BaseAmount: pgconv.NumericToDecimalZero(r.BaseAmount),
		TaxAmount:  pgconv.NumericToDecimalZero(r.TaxAmount),
	}
}

func receiptFromRow(r sqlcgen.Receipt) *domain.Receipt {
	return &domain.Receipt{
		ID:              r.ID,
		CompanyID:       r.CompanyID,
		ContactID:       r.ContactID,
		Date:            r.Date.Time,
		Number:          r.Number,
		Currency:        r.Currency,
		ExchangeRate:    pgconv.NumericToDecimalZero(r.ExchangeRate),
		TotalAmount:     pgconv.NumericToDecimalZero(r.TotalAmount),
		OnAccountAmount: pgconv.NumericToDecimalZero(r.OnAccountAmount),
		Notes:           r.Notes,
		CreatedBy:       r.CreatedBy,
		CreatedAt:       r.CreatedAt.Time,
	}
}

func paymentMethodFromReceiptRow(r sqlcgen.ReceiptPaymentMethod) *domain.PaymentMethod {
	return &domain.PaymentMethod{
		ID:             r.ID,
		MethodType:     r.MethodType,
		CashRegisterID: pgconv.UUIDPtr(r.CashRegisterID),
		BankAccountID:  pgconv.UUIDPtr(r.BankAccountID),
		Amount:         pgconv.NumericToDecimalZero(r.Amount),
		Currency:       r.Currency,
		CheckNumber:    r.CheckNumber,
		CheckDate:      pgconv.TimePtr(r.CheckDate),
	}
}

func applicationFromReceiptRow(r sqlcgen.ReceiptInvoiceApplication) *domain.Application {
	return &domain.Application{
		ID:        r.ID,
		InvoiceID: r.InvoiceID,
		Amount:    pgconv.NumericToDecimalZero(r.Amount),
	}
}

func paymentOrderFromRow(r sqlcgen.PaymentOrder) *domain.PaymentOrder {
	return &domain.PaymentOrder{
		ID:           r.ID,
		CompanyID:    r.CompanyID,
		SupplierID:   r.SupplierID,
		Date:         r.Date.Time,
		Number:       r.Number,
		Currency:     r.Currency,
		ExchangeRate: pgconv.NumericToDecimalZero(r.ExchangeRate),
		TotalAmount:  pgconv.NumericToDecimalZero(r.TotalAmount),
		Notes:        r.Notes,
		CreatedBy:    r.CreatedBy,
		CreatedAt:    r.CreatedAt.Time,
	}
}

func invoiceReceivedFromRow(r sqlcgen.InvoicesReceived) *domain.InvoiceReceived {
	return &domain.InvoiceReceived{
		ID:          r.ID,
		CompanyID:   r.CompanyID,
		SupplierID:  r.SupplierID,
		InvoiceType: r.InvoiceType,
		SalePoint:   r.SalePoint,
		Number:      r.Number,
		IssueDate:   pgconv.TimePtr(r.IssueDate),
		DueDate:     pgconv.TimePtr(r.DueDate),
		Currency:    r.Currency,
		NetAmount:   pgconv.NumericToDecimalZero(r.NetAmount),
		TaxAmount:   pgconv.NumericToDecimalZero(r.TaxAmount),
		TotalAmount: pgconv.NumericToDecimalZero(r.TotalAmount),
		PaidAmount:  pgconv.NumericToDecimalZero(r.PaidAmount),
		Status:      r.Status,
		ProjectID:   pgconv.UUIDPtr(r.ProjectID),
		Notes:       r.Notes,
		CreatedAt:   r.CreatedAt.Time,
	}
}

func cashRegisterFromRow(r sqlcgen.CashRegister) *domain.CashRegister {
	return &domain.CashRegister{
		ID:            r.ID,
		CompanyID:     r.CompanyID,
		Name:          r.Name,
		Currency:      r.Currency,
		ResponsibleID: pgconv.UUIDPtr(r.ResponsibleID),
		IsActive:      r.IsActive,
		CreatedAt:     r.CreatedAt.Time,
	}
}

func cashSessionFromRow(r sqlcgen.CashRegisterSession) *domain.CashSession {
	return &domain.CashSession{
		ID:                       r.ID,
		CashRegisterID:           r.CashRegisterID,
		OpenedBy:                 r.OpenedBy,
		OpenedAt:                 r.OpenedAt.Time,
		ClosedBy:                 pgconv.UUIDPtr(r.ClosedBy),
		ClosedAt:                 pgconv.TimestamptzPtr(r.ClosedAt),
		OpeningBalance:           pgconv.NumericToDecimalZero(r.OpeningBalance),
		DeclaredClosingBalance:   pgconv.NumericToDecimal(r.DeclaredClosingBalance),
		CalculatedClosingBalance: pgconv.NumericToDecimal(r.CalculatedClosingBalance),
		Difference:               pgconv.NumericToDecimal(r.Difference),
		Status:                   r.Status,
	}
}

func cashMovementFromRow(r sqlcgen.CashMovement) *domain.CashMovement {
	return &domain.CashMovement{
		ID:             r.ID,
		CompanyID:      r.CompanyID,
		CashRegisterID: r.CashRegisterID,
		SessionID:      pgconv.UUIDPtr(r.SessionID),
		Type:           r.Type,
		Amount:         pgconv.NumericToDecimalZero(r.Amount),
		Currency:       r.Currency,
		Description:    r.Description,
		ReferenceType:  r.ReferenceType,
		ReferenceID:    pgconv.UUIDPtr(r.ReferenceID),
		CreatedBy:      r.CreatedBy,
		CreatedAt:      r.CreatedAt.Time,
	}
}

func bankAccountFromRow(r sqlcgen.BankAccountsFinance) *domain.BankAccount {
	return &domain.BankAccount{
		ID:            r.ID,
		CompanyID:     r.CompanyID,
		BankName:      r.BankName,
		AccountNumber: r.AccountNumber,
		CBU:           r.Cbu,
		Alias:         r.Alias,
		Currency:      r.Currency,
		AccountHolder: r.AccountHolder,
		BookBalance:   pgconv.NumericToDecimalZero(r.BookBalance),
		IsActive:      r.IsActive,
		CreatedAt:     r.CreatedAt.Time,
	}
}

func bankMovementFromRow(r sqlcgen.BankMovement) *domain.BankMovement {
	return &domain.BankMovement{
		ID:            r.ID,
		CompanyID:     r.CompanyID,
		BankAccountID: r.BankAccountID,
		Type:          r.Type,
		Amount:        pgconv.NumericToDecimalZero(r.Amount),
		Currency:      r.Currency,
		Description:   r.Description,
		ReferenceType: r.ReferenceType,
		ReferenceID:   pgconv.UUIDPtr(r.ReferenceID),
		Reconciled:    r.Reconciled,
		ValueDate:     r.ValueDate.Time,
		CreatedBy:     r.CreatedBy,
		CreatedAt:     r.CreatedAt.Time,
	}
}

func expenseFromRow(r sqlcgen.Expense) *domain.Expense {
	return &domain.Expense{
		ID:                  r.ID,
		CompanyID:           r.CompanyID,
		Date:                r.Date.Time,
		CategoryID:          r.CategoryID,
		Description:         r.Description,
		Amount:              pgconv.NumericToDecimalZero(r.Amount),
		Currency:            r.Currency,
		PaidByUserID:        pgconv.UUIDPtr(r.PaidByUserID),
		PaidByCashID:        pgconv.UUIDPtr(r.PaidByCashID),
		PaidByBankID:        pgconv.UUIDPtr(r.PaidByBankID),
		ProjectID:           pgconv.UUIDPtr(r.ProjectID),
		Status:              domain.ExpenseStatus(r.Status),
		ApproverID:          pgconv.UUIDPtr(r.ApproverID),
		ReimbursementStatus: r.ReimbursementStatus,
		CreatedAt:           r.CreatedAt.Time,
	}
}

func recurringFromRow(r sqlcgen.RecurringPayment) *domain.RecurringPayment {
	return &domain.RecurringPayment{
		ID:            r.ID,
		CompanyID:     r.CompanyID,
		SupplierID:    pgconv.UUIDPtr(r.SupplierID),
		Description:   r.Description,
		Amount:        pgconv.NumericToDecimal(r.Amount),
		Currency:      r.Currency,
		Frequency:     r.Frequency,
		DueDay:        r.DueDay,
		NextDueDate:   pgconv.TimePtr(r.NextDueDate),
		PaymentMethod: r.PaymentMethod,
		CategoryID:    pgconv.UUIDPtr(r.CategoryID),
		Status:        r.Status,
		CreatedAt:     r.CreatedAt.Time,
	}
}

func obligationFromRow(r sqlcgen.PaymentObligation) *domain.PaymentObligation {
	return &domain.PaymentObligation{
		ID:             r.ID,
		CompanyID:      r.CompanyID,
		SourceType:     r.SourceType,
		SourceID:       pgconv.UUIDPtr(r.SourceID),
		Description:    r.Description,
		Amount:         pgconv.NumericToDecimalZero(r.Amount),
		Currency:       r.Currency,
		DueDate:        r.DueDate.Time,
		Status:         r.Status,
		PaidAt:         pgconv.TimestamptzPtr(r.PaidAt),
		PaymentOrderID: pgconv.UUIDPtr(r.PaymentOrderID),
		CreatedAt:      r.CreatedAt.Time,
	}
}
