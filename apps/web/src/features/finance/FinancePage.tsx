import type { ReceivableDto, SubscriptionDto } from "@crm/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, ChevronLeft, ChevronRight, Copy, Download, Plus, Wallet } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../../components/layout/AppLayout";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Chip } from "../../components/ui/Chip";
import { cn } from "../../components/ui/cn";
import { Field, Input, Select } from "../../components/ui/Field";
import { Notice, useNotice } from "../../components/ui/Notice";
import { Empty, ErrorBox, Skeleton } from "../../components/ui/States";
import { Tabs } from "../../components/ui/Tabs";
import { useCopy } from "../../hooks/useCopy";
import { downloadCsv } from "../../lib/csv";
import { day, money, plural } from "../../lib/format";
import { financeRoute } from "../../router";
import { useClientOptions } from "../tasks/api";
import { addMonths, monthTitle, todayAr } from "../tasks/time";
import {
  useAdjustments,
  useAdjustPrices,
  useCash,
  useFinanceSummary,
  useReceivables,
  useReimburse,
  useRunAccrual,
  useSetReminder,
  useSubscriptions,
  useUpdateSubscription,
} from "./api";
import { type CashDraft, CashDialog, type PaymentTarget, PaymentDialog, SubscriptionDialog } from "./dialogs";
import { parseMovement } from "./quick-movement";

type Tab = "cobrar" | "abonos" | "movimientos";

export function FinancePage() {
  const search = financeRoute.useSearch();
  const navigate = useNavigate({ from: financeRoute.fullPath });
  const tab: Tab = search.tab ?? "cobrar";
  const month = search.mes ?? todayAr().slice(0, 7);
  const summary = useFinanceSummary();
  const receivables = useReceivables();
  const subs = useSubscriptions();
  const cash = useCash(month);
  const clients = useClientOptions();
  const notice = useNotice();
  const [text, setText] = useState("");
  const [payTarget, setPayTarget] = useState<PaymentTarget | null>(null);
  const [cashDraft, setCashDraft] = useState<CashDraft | null>(null);

  const set = (patch: { tab?: Tab | undefined; mes?: string | undefined }) =>
    void navigate({ search: (s) => ({ ...s, ...patch }), replace: true });

  const quickAdd = () => {
    if (!text.trim()) return;
    const d = parseMovement(text, clients.data ?? []);
    const client = clients.data?.find((c) => c.id === d.clientId);
    // Un ingreso de un cliente es un cobro (recibo + cuenta corriente); lo demás va a la caja.
    if (d.direction === "ingreso" && client) {
      setPayTarget({ clientId: client.id, clientName: client.name, ...(d.amount && { amount: d.amount }) });
    } else {
      setCashDraft(d);
    }
    setText("");
  };

  const exportTab = () => {
    if (tab === "cobrar") {
      downloadCsv(
        `por-cobrar-${todayAr()}.csv`,
        ["Cliente", "Concepto", "Vence", "Importe"],
        (receivables.data ?? []).map((r) => [r.client.name, r.concept, r.dueOn ? day(r.dueOn) : "", r.amount / 100]),
      );
    } else if (tab === "abonos") {
      downloadCsv(
        `abonos-${todayAr()}.csv`,
        ["Cliente", "Plan", "Día de facturación", "Valor", "Activo"],
        (subs.data ?? []).map((s) => [s.client.name, s.name, s.billingDay, s.amount / 100, s.active ? "Sí" : "No"]),
      );
    } else {
      downloadCsv(
        `movimientos-${month}.csv`,
        ["Fecha", "Tipo", "Concepto", "Categoría", "Cliente", "Lo pagó", "A devolver", "Importe"],
        (cash.data ?? []).map((m) => [
          day(m.occurredOn),
          m.direction === "ingreso" ? "Ingreso" : "Gasto",
          m.concept,
          m.category,
          m.client?.name ?? null,
          m.paidBy?.name ?? null,
          m.reimbursable ? (m.reimbursedAt ? "Devuelto" : "Pendiente") : "",
          (m.direction === "ingreso" ? 1 : -1) * (m.amount / 100),
        ]),
      );
    }
  };

  const s = summary.data;
  return (
    <>
      <PageHeader
        title="Finanzas"
        subtitle={monthTitle(todayAr())}
        actions={
          <Button variant="secondary" onClick={exportTab}>
            <Download size={16} aria-hidden /> Exportar a Excel
          </Button>
        }
      />

      {summary.error ? (
        <ErrorBox error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-[18px] lg:grid-cols-4">
          <Kpi label="Cobrado este mes" value={s && money(s.collectedThisMonth)} tone="green" />
          <Kpi label="Por cobrar" value={s && money(s.receivable)} hint={s && plural(s.receivableCount, "pendiente", "pendientes")} />
          <Kpi label="Vencido" value={s && money(s.overdue)} tone={s?.overdue ? "red" : undefined} />
          <Kpi label="Ingreso fijo mensual (abonos)" value={s && money(s.monthlyRecurring)} />
        </div>
      )}

      <Card className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
        <Wallet size={18} aria-hidden className="ml-1 hidden shrink-0 text-brand sm:block" />
        <label className="min-w-0 flex-1">
          <span className="sr-only">Movimiento</span>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), quickAdd())}
            placeholder="Cargá un movimiento en texto… ej: pagué 25000 de hosting / cobré 150000 de La Espiga"
            className="border-transparent bg-slate-50"
          />
        </label>
        <Button onClick={quickAdd} disabled={!text.trim()}>
          Cargar
        </Button>
      </Card>

      <section className="flex flex-col gap-4">
        <Tabs<Tab>
          label="Secciones de finanzas"
          value={tab}
          onChange={(t) => set({ tab: t === "cobrar" ? undefined : t })}
          items={[
            { key: "cobrar", label: `Por cobrar (${receivables.data?.length ?? "…"})` },
            { key: "abonos", label: "Abonos" },
            { key: "movimientos", label: "Movimientos" },
          ]}
        />
        {tab === "cobrar" && <ReceivablesTab onPay={setPayTarget} onNotice={notice.show} />}
        {tab === "abonos" && <SubscriptionsTab onNotice={notice.show} />}
        {tab === "movimientos" && (
          <MovementsTab
            month={month}
            onMonth={(m) => set({ mes: m === todayAr().slice(0, 7) ? undefined : m })}
            onNew={() => setCashDraft({ direction: "egreso", amount: 0, concept: "" })}
            onNotice={notice.show}
          />
        )}
      </section>

      <PaymentDialog target={payTarget} onClose={() => setPayTarget(null)} onDone={notice.show} />
      <CashDialog draft={cashDraft} onClose={() => setCashDraft(null)} onDone={notice.show} />
      <Notice message={notice.message} />
    </>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string | undefined; hint?: string | undefined; tone?: "green" | "red" | undefined }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-xs text-muted">{label}</span>
      {value === undefined ? (
        <Skeleton className="h-7 w-2/3" />
      ) : (
        <strong className={cn("text-2xl tracking-tight", tone === "green" && "text-green-700", tone === "red" && "text-red-700")}>{value}</strong>
      )}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </Card>
  );
}

// ─── Por cobrar ─────────────────────────────────────────────────────────────

function dueChip(days: number | null) {
  if (days === null) return <Chip tone="slate">sin vencimiento</Chip>;
  if (days < 0) return <Chip tone="red">vencida hace {-days}d</Chip>;
  if (days === 0) return <Chip tone="amber">vence hoy</Chip>;
  return <Chip tone="slate">en {plural(days, "día", "días")}</Chip>;
}

function ReceivablesTab({ onPay, onNotice }: { onPay: (t: PaymentTarget) => void; onNotice: (m: string) => void }) {
  const receivables = useReceivables();
  const reminder = useSetReminder();
  const { copied, copy } = useCopy();

  if (receivables.error) return <ErrorBox error={receivables.error} onRetry={() => void receivables.refetch()} />;
  if (receivables.isPending) return <Skeleton className="h-48" />;
  if (receivables.data.length === 0) return <Empty>No hay nada por cobrar.</Empty>;

  const reminderText = (r: ReceivableDto) =>
    `Hola! Te escribimos para avisarte: ${r.daysToDue !== null && r.daysToDue < 0 ? "quedó pendiente" : "te recordamos"} el pago de ${r.concept} por ${money(r.amount)}${r.dueOn ? ` (vencimiento ${day(r.dueOn)})` : ""}. Cualquier cosa avisanos. ¡Gracias!`;

  return (
    <Card className="divide-y divide-slate-100">
      {receivables.data.map((r) => (
        <div key={`${r.kind}-${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <Link to="/clientes/$clientId" params={{ clientId: r.client.id }} search={{ tab: "cuenta" }} className="font-semibold hover:underline">
              {r.client.name}
            </Link>
            <p className="text-sm text-muted">
              {r.concept}
              {r.kind === "installment" && <span className="ml-1.5 text-xs">(sin facturar)</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {dueChip(r.daysToDue)}
            <strong className="w-28 text-right tabular-nums">{money(r.amount)}</strong>
            {r.autoReminder === null ? (
              <span className="hidden w-36 sm:block" aria-hidden />
            ) : (
              <label className="flex w-36 items-center gap-1.5 text-xs text-muted" title="Lo envía el recordatorio automático (paso 7)">
                <input
                  type="checkbox"
                  role="switch"
                  className="size-4 accent-brand"
                  checked={r.autoReminder}
                  onChange={(e) => reminder.mutate({ id: r.id, autoReminder: e.target.checked })}
                />
                recordatorio auto
              </label>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void copy(r.id, reminderText(r)).then(() => onNotice("Mensaje copiado: pegalo en WhatsApp o en un mail."))}
            >
              {copied === r.id ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />} Copiar recordatorio
            </Button>
            <Button
              size="sm"
              onClick={() =>
                onPay({
                  clientId: r.client.id,
                  clientName: r.client.name,
                  concept: r.concept,
                  amount: r.amount,
                  ...(r.kind === "invoice" ? { invoiceId: r.id } : { installmentId: r.id }),
                })
              }
            >
              Cobrada
            </Button>
          </div>
        </div>
      ))}
    </Card>
  );
}

// ─── Abonos ─────────────────────────────────────────────────────────────────

/** Próxima fecha de factura de un abono (este mes si todavía no pasó el día, si no el que viene). */
function nextInvoiceDate(s: SubscriptionDto, today: string) {
  const thisMonth = `${today.slice(0, 7)}-${String(s.billingDay).padStart(2, "0")}`;
  const billedThisMonth = s.lastAccrued?.slice(0, 7) === today.slice(0, 7);
  return billedThisMonth || thisMonth < today ? `${addMonths(today, 1).slice(0, 7)}-${String(s.billingDay).padStart(2, "0")}` : thisMonth;
}

function SubscriptionsTab({ onNotice }: { onNotice: (m: string) => void }) {
  const subs = useSubscriptions();
  const adjustments = useAdjustments();
  const adjust = useAdjustPrices();
  const accrual = useRunAccrual();
  const update = useUpdateSubscription();
  const today = todayAr();
  const months = [today.slice(0, 7), addMonths(today, 1).slice(0, 7)];
  const [selected, setSelected] = useState<ReadonlySet<string> | null>(null);
  const [pct, setPct] = useState("");
  const [effective, setEffective] = useState(months[1] ?? "");
  const [accrualMonth, setAccrualMonth] = useState(months[0] ?? "");
  const [creating, setCreating] = useState(false);

  if (subs.error) return <ErrorBox error={subs.error} onRetry={() => void subs.refetch()} />;
  if (subs.isPending) return <Skeleton className="h-48" />;

  const active = subs.data.filter((s) => s.active);
  // Por defecto, todos los activos tildados.
  const sel = selected ?? new Set(active.map((s) => s.id));
  const percent = Number(pct.replace(",", "."));
  const validPct = Number.isFinite(percent) && percent > 0;
  const chosen = active.filter((s) => sel.has(s.id));
  const raised = (cents: number) => Math.round((cents * (1 + percent / 100)) / 100) * 100;

  const toggle = (id: string) => {
    const n = new Set(sel);
    if (!n.delete(id)) n.add(id);
    setSelected(n);
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="grid gap-[18px] lg:grid-cols-2">
        <Card className="flex flex-col gap-3 p-5">
          <div>
            <h2 className="font-bold">Actualizar valores por IPC</h2>
            <p className="text-sm text-muted">Aplica el aumento a los abonos tildados. Queda registrado en el historial.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[110px_minmax(0,1fr)_auto] sm:items-end">
            <Field label="% del período">
              <Input inputMode="decimal" placeholder="Ej: 2,7" value={pct} onChange={(e) => setPct(e.target.value.replace(/[^\d.,]/g, ""))} />
            </Field>
            <Field label="Rige desde">
              <Select value={effective} onChange={(e) => setEffective(e.target.value)}>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthTitle(`${m}-01`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              disabled={!validPct || chosen.length === 0 || adjust.isPending}
              onClick={() =>
                adjust.mutate(
                  { percent, effectiveOn: `${effective}-01`, subscriptionIds: chosen.map((s) => s.id) },
                  { onSuccess: (r) => (setPct(""), onNotice(`Aumento de ${pct}% aplicado a ${plural(r.count, "abono", "abonos")}.`)) },
                )
              }
            >
              Aplicar aumento
            </Button>
          </div>
          {validPct && chosen.length > 0 && (
            <p className="rounded-[10px] bg-slate-50 px-3 py-2 text-xs text-slate-700">
              Vista previa: {chosen.map((s) => `${s.client.name.split(" ")[0]} ${money(s.amount)} → ${money(raised(s.amount))}`).join(" · ")}
            </p>
          )}
          {adjust.error && <p role="alert" className="text-sm text-red-700">{adjust.error.message}</p>}
          <div className="border-t border-line pt-3">
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">Historial de aumentos</h3>
            {adjustments.data?.length ? (
              <ul className="flex flex-col gap-1 text-sm">
                {adjustments.data.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2">
                    <span>
                      {day(a.effectiveOn)} · {String(a.percent).replace(".", ",")}%
                    </span>
                    <span className="text-muted">
                      {plural(a.count, "abono", "abonos")}
                      {a.appliedBy && ` · ${a.appliedBy}`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Todavía no hubo aumentos.</p>
            )}
          </div>
        </Card>

        <Card className="flex flex-col gap-3 p-5">
          <div>
            <h2 className="font-bold">Devengamiento</h2>
            <p className="text-sm text-muted">
              Genera la factura de cada abono en la cuenta corriente de cada cliente. Si un abono ya tiene la factura de ese mes, no la
              repite.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Período">
              <Select value={accrualMonth} onChange={(e) => setAccrualMonth(e.target.value)}>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthTitle(`${m}-01`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Button disabled={accrual.isPending} onClick={() => accrual.mutate(accrualMonth)}>
              Generar devengamiento
            </Button>
          </div>
          <p className="text-xs text-muted">La facturación automática el día de cada abono llega con Automatizaciones (paso 7).</p>
          {accrual.error && <p role="alert" className="text-sm text-red-700">{accrual.error.message}</p>}
          {accrual.data && (
            <div className="flex flex-col gap-1.5 rounded-[10px] bg-green-50 px-3 py-2.5 text-sm text-green-900">
              <strong>
                {accrual.data.created.length
                  ? `Se generaron ${plural(accrual.data.created.length, "factura", "facturas")} · ${money(accrual.data.created.reduce((a, d) => a + d.amount, 0))}`
                  : "No había nada para facturar"}
                {accrual.data.skipped > 0 && ` (${accrual.data.skipped} ya estaban facturados)`}
              </strong>
              {accrual.data.created.map((d) => (
                <span key={d.concept + d.client} className="flex justify-between gap-2">
                  <span>
                    {d.client} · {d.concept}
                  </span>
                  <strong>{money(d.amount)}</strong>
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="overflow-x-auto">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <label className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted uppercase">
            <input
              type="checkbox"
              className="size-4 accent-brand"
              checked={active.length > 0 && chosen.length === active.length}
              onChange={() => setSelected(chosen.length === active.length ? new Set() : new Set(active.map((s) => s.id)))}
              aria-label="Seleccionar todos"
            />
            Cliente / plan
          </label>
          <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden /> Nuevo abono
          </Button>
        </div>
        {subs.data.length === 0 && <p className="p-4 text-sm text-muted">Todavía no hay abonos.</p>}
        <ul className="divide-y divide-slate-100">
          {subs.data.map((s) => (
            <li key={s.id} className={cn("flex flex-wrap items-center justify-between gap-3 px-4 py-3", !s.active && "opacity-60")}>
              <label className="flex min-w-0 items-center gap-3">
                <input type="checkbox" className="size-4 accent-brand" disabled={!s.active} checked={s.active && sel.has(s.id)} onChange={() => toggle(s.id)} />
                <span className="min-w-0">
                  <strong className="block truncate">{s.client.name}</strong>
                  <span className="block text-xs text-muted">
                    {s.name} · {s.active ? `próxima factura ${day(nextInvoiceDate(s, today)).slice(0, 5)}` : "dado de baja"}
                  </span>
                </span>
              </label>
              <span className="flex items-center gap-3">
                {s.previousAmount !== null && s.previousAmount !== s.amount && (
                  <span className="text-xs text-muted line-through">{money(s.previousAmount)}</span>
                )}
                <strong className="tabular-nums">{money(s.amount)}</strong>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    update.mutate(
                      { id: s.id, active: !s.active },
                      { onSuccess: () => onNotice(s.active ? `Abono "${s.name}" dado de baja.` : `Abono "${s.name}" reactivado.`) },
                    )
                  }
                >
                  {s.active ? "Dar de baja" : "Reactivar"}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <SubscriptionDialog open={creating} onClose={() => setCreating(false)} onDone={onNotice} />
    </div>
  );
}

// ─── Movimientos ────────────────────────────────────────────────────────────

function MovementsTab({
  month,
  onMonth,
  onNew,
  onNotice,
}: {
  month: string;
  onMonth: (m: string) => void;
  onNew: () => void;
  onNotice: (m: string) => void;
}) {
  const cash = useCash(month);
  const reimburse = useReimburse();
  const inMonth = (cash.data ?? []).filter((m) => m.occurredOn.startsWith(month));
  const pendingRefunds = (cash.data ?? []).filter((m) => m.reimbursable && !m.reimbursedAt);
  const income = inMonth.filter((m) => m.direction === "ingreso").reduce((a, m) => a + m.amount, 0);
  const expense = inMonth.filter((m) => m.direction === "egreso").reduce((a, m) => a + m.amount, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" aria-label="Mes anterior" onClick={() => onMonth(addMonths(`${month}-01`, -1).slice(0, 7))}>
            <ChevronLeft size={16} aria-hidden />
          </Button>
          <strong className="w-40 text-center">{monthTitle(`${month}-01`)}</strong>
          <Button size="sm" variant="secondary" aria-label="Mes siguiente" onClick={() => onMonth(addMonths(`${month}-01`, 1).slice(0, 7))}>
            <ChevronRight size={16} aria-hidden />
          </Button>
        </div>
        <span className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-green-700">Ingresos {money(income)}</span>
          <span className="text-red-700">Gastos {money(expense)}</span>
          <strong>Neto {money(income - expense)}</strong>
          <Button size="sm" onClick={onNew}>
            <Plus size={14} aria-hidden /> Movimiento
          </Button>
        </span>
      </div>

      {pendingRefunds.length > 0 && (
        <Card className="flex flex-col gap-2 border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-bold text-amber-950">A devolver</h3>
          {pendingRefunds.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {m.paidBy?.name} pagó <strong>{m.concept}</strong> el {day(m.occurredOn).slice(0, 5)}
              </span>
              <span className="flex items-center gap-2">
                <strong>{money(m.amount)}</strong>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={reimburse.isPending}
                  onClick={() => reimburse.mutate(m.id, { onSuccess: () => onNotice(`Marcado como devuelto a ${m.paidBy?.name}.`) })}
                >
                  Ya se le devolvió
                </Button>
              </span>
            </div>
          ))}
        </Card>
      )}

      {cash.error ? (
        <ErrorBox error={cash.error} onRetry={() => void cash.refetch()} />
      ) : cash.isPending ? (
        <Skeleton className="h-48" />
      ) : inMonth.length === 0 ? (
        <Empty>No hay movimientos en {monthTitle(`${month}-01`).toLowerCase()}.</Empty>
      ) : (
        <Card className="divide-y divide-slate-100">
          {inMonth.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-12 shrink-0 text-xs font-semibold text-muted tabular-nums">{day(m.occurredOn).slice(0, 5)}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.concept}</p>
                  <p className="truncate text-xs text-muted">
                    {[m.category, m.paidBy && `pagó ${m.paidBy.name}`, m.reimbursable && (m.reimbursedAt ? "devuelto" : "a devolver")]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                </div>
              </div>
              <strong className={cn("shrink-0 tabular-nums", m.direction === "ingreso" ? "text-green-700" : "text-red-700")}>
                {m.direction === "ingreso" ? "" : "− "}
                {money(m.amount)}
              </strong>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
