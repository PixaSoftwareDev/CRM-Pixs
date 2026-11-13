/** Datos de Finanzas para el front. Todo cobro refresca también el Cliente 360 y los proyectos. */
import type {
  AccrualResult,
  CashMovementCreate,
  CashMovementDto,
  FinanceSummary,
  InstallmentPay,
  InstallmentPlanCreate,
  InstallmentPlanDto,
  InvoiceCreate,
  PaymentCreate,
  PriceAdjustmentCreate,
  PriceAdjustmentDto,
  ReceivableDto,
  SubscriptionCreate,
  SubscriptionDto,
  SubscriptionUpdate,
} from "@pixs/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

export const financeKeys = {
  all: ["finance"] as const,
  summary: ["finance", "summary"] as const,
  receivables: ["finance", "receivables"] as const,
  subscriptions: ["finance", "subscriptions"] as const,
  adjustments: ["finance", "adjustments"] as const,
  cash: (month: string) => ["finance", "cash", month] as const,
  plans: (projectId: string) => ["finance", "plans", projectId] as const,
};

export const useFinanceSummary = () =>
  useQuery({ queryKey: financeKeys.summary, queryFn: () => api.get<FinanceSummary>("/api/finance/summary") });
export const useReceivables = () =>
  useQuery({ queryKey: financeKeys.receivables, queryFn: () => api.get<ReceivableDto[]>("/api/finance/receivables") });
export const useSubscriptions = () =>
  useQuery({ queryKey: financeKeys.subscriptions, queryFn: () => api.get<SubscriptionDto[]>("/api/subscriptions") });
export const useAdjustments = () =>
  useQuery({ queryKey: financeKeys.adjustments, queryFn: () => api.get<PriceAdjustmentDto[]>("/api/price-adjustments") });
export const useCash = (month: string) =>
  useQuery({ queryKey: financeKeys.cash(month), queryFn: () => api.get<CashMovementDto[]>("/api/cash", { month }) });
export const useInstallmentPlans = (projectId: string) =>
  useQuery({
    queryKey: financeKeys.plans(projectId),
    queryFn: () => api.get<InstallmentPlanDto[]>(`/api/projects/${projectId}/installment-plans`),
  });

function useInvalidate() {
  const qc = useQueryClient();
  return () => Promise.all([["finance"], ["clients"], ["projects"]].map((queryKey) => qc.invalidateQueries({ queryKey })));
}

function useWrite<B, R = void>(fn: (body: B) => Promise<R>) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: fn, onSuccess: invalidate });
}

export type PaymentResult = { receiptId: string; number: number; allocated: number; credit: number };

export const useRegisterPayment = () =>
  useWrite(({ clientId, ...body }: PaymentCreate & { clientId: string }) =>
    api.post<PaymentResult>(`/api/clients/${clientId}/payments`, body),
  );
export const usePayInstallment = () =>
  useWrite(({ id, ...body }: InstallmentPay & { id: string }) => api.post<PaymentResult>(`/api/installments/${id}/pay`, body));
export const useSetReminder = () =>
  useWrite(({ id, autoReminder }: { id: string; autoReminder: boolean }) => api.patch(`/api/installments/${id}`, { autoReminder }));
export const useCreateInvoice = () =>
  useWrite(({ clientId, ...body }: InvoiceCreate & { clientId: string }) =>
    api.post<{ id: string }>(`/api/clients/${clientId}/invoices`, body),
  );
export const useCreatePlan = (projectId: string) =>
  useWrite((body: InstallmentPlanCreate) => api.post<{ id: string }>(`/api/projects/${projectId}/installment-plans`, body));
export const useCreateSubscription = () => useWrite((body: SubscriptionCreate) => api.post<{ id: string }>("/api/subscriptions", body));
export const useUpdateSubscription = () =>
  useWrite(({ id, ...body }: SubscriptionUpdate & { id: string }) => api.patch(`/api/subscriptions/${id}`, body));
export const useAdjustPrices = () =>
  useWrite((body: PriceAdjustmentCreate) => api.post<{ id: string; count: number }>("/api/price-adjustments", body));
export const useRunAccrual = () => useWrite((month: string) => api.post<AccrualResult>("/api/accruals", { month }));
export const useCreateCash = () => useWrite((body: CashMovementCreate) => api.post<{ id: string }>("/api/cash", body));
export const useReimburse = () => useWrite((id: string) => api.post(`/api/cash/${id}/reimburse`));
