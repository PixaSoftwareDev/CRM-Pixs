import type { ClientDetail } from "@crm/shared";
import { Plus, Printer, Receipt } from "lucide-react";
import { useState } from "react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Chip } from "../../../components/ui/Chip";
import { cn } from "../../../components/ui/cn";
import { Input } from "../../../components/ui/Field";
import { Empty, ErrorBox, Skeleton } from "../../../components/ui/States";
import { day, money, todayIso } from "../../../lib/format";
import { formatCuit } from "@crm/shared";
import { Notice, useNotice } from "../../../components/ui/Notice";
import { InvoiceDialog, type PaymentTarget, PaymentDialog } from "../../finance/dialogs";
import { useStatement } from "../api";
import { DOC_KIND } from "../labels";

function monthsAgo(n: number): string {
  const d = new Date(`${todayIso()}T12:00:00`);
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

const QUICK = [
  { label: "Todo", from: undefined },
  { label: "Últimos 3 meses", from: () => monthsAgo(3) },
  { label: "Este año", from: () => `${todayIso().slice(0, 4)}-01-01` },
] as const;

export function StatementTab({ client }: { client: ClientDetail }) {
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const st = useStatement(client.id, from, to);
  const today = todayIso();
  const notice = useNotice();
  const [pay, setPay] = useState<PaymentTarget | null>(null);
  const [invoicing, setInvoicing] = useState(false);
  const balance = st.data?.closingBalance ?? 0;

  /** Imprime solo este estado de cuenta (el navegador permite guardarlo como PDF). */
  const print = () => {
    document.body.dataset.print = "statement";
    window.addEventListener("afterprint", () => delete document.body.dataset.print, { once: true });
    window.print();
  };

  return (
    <Card id="statement-print" className="flex flex-col gap-4 p-5">
      {/* Encabezado que solo aparece en el papel. */}
      <div className="hidden items-start justify-between border-b border-line pb-3 print:flex">
        <div>
          <strong className="text-xl">Estado de cuenta</strong>
          <p className="text-xs text-muted">Emitido el {day(today)}</p>
        </div>
        <p className="text-right text-xs text-muted">
          Período: {from ? day(from) : "desde el inicio"} al {day(to ?? today)}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
        <Button size="sm" onClick={() => setPay({ clientId: client.id, clientName: client.name, ...(balance > 0 && { amount: balance }) })}>
          <Receipt size={14} aria-hidden /> Registrar cobro
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setInvoicing(true)}>
          <Plus size={14} aria-hidden /> Nueva factura
        </Button>
        <Button size="sm" variant="secondary" onClick={print} disabled={!st.data}>
          <Printer size={14} aria-hidden /> Imprimir PDF
        </Button>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Estado de cuenta</h2>
          <p className="text-xs text-muted">
            {client.legalName ?? client.name}
            {client.taxId && ` · CUIT ${formatCuit(client.taxId)}`}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2 print:hidden">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Desde
            <Input type="date" value={from ?? ""} max={to} onChange={(e) => setFrom(e.target.value || undefined)} className="w-40" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Hasta
            <Input type="date" value={to ?? ""} min={from} onChange={(e) => setTo(e.target.value || undefined)} className="w-40" />
          </label>
          <div className="flex gap-1">
            {QUICK.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => {
                  setFrom(q.from?.());
                  setTo(undefined);
                }}
                className="h-[38px] rounded-[10px] border border-line bg-white px-3 text-xs font-medium hover:bg-slate-50"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {st.error && <ErrorBox error={st.error} onRetry={() => void st.refetch()} />}
      {st.isPending ? (
        <Skeleton className="h-32" />
      ) : st.data ? (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Saldo anterior" value={money(st.data.openingBalance)} />
            <Stat label="Facturado en el período" value={money(st.data.totalDebit)} />
            <Stat label="Cobrado en el período" value={money(st.data.totalCredit)} />
            <Stat label={`Saldo al ${day(st.data.to ?? today)}`} value={money(st.data.closingBalance)} strong />
          </dl>

          {st.data.rows.length === 0 ? (
            <Empty>No hay movimientos entre esas fechas.</Empty>
          ) : (
            <div className={cn("overflow-x-auto rounded-xl border border-line print:overflow-visible", st.isPlaceholderData && "opacity-60")}>
              <table className="w-full min-w-[760px] border-collapse text-sm print:min-w-0">
                <thead>
                  <tr className="bg-slate-50 text-left text-[11px] font-semibold tracking-wider text-muted uppercase">
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Comprobante</th>
                    <th className="px-3 py-2">Concepto</th>
                    <th className="px-3 py-2 text-right">Debe</th>
                    <th className="px-3 py-2 text-right">Haber</th>
                    <th className="px-3 py-2 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {st.data.from && (
                    <tr className="border-t border-slate-100 text-muted">
                      <td className="px-3 py-2">{day(st.data.from)}</td>
                      <td className="px-3 py-2 italic" colSpan={4}>
                        Saldo anterior
                      </td>
                      <td className="px-3 py-2 text-right">{money(st.data.openingBalance)}</td>
                    </tr>
                  )}
                  {st.data.rows.map((r) => {
                    const kind = DOC_KIND[r.kind] ?? { label: r.kind, tone: "slate" as const };
                    const overdue = r.pendingAmount > 0 && r.dueOn !== null && r.dueOn < today;
                    return (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">{day(r.issuedOn)}</td>
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-2">
                            <Chip tone={kind.tone}>{kind.label}</Chip>
                            <span className="text-xs text-muted">{r.number}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {r.concept}
                          {r.pendingAmount > 0 && (
                            <Chip tone={overdue ? "red" : "amber"} className="ml-2">
                              {overdue ? "vencida" : "vence"} {day(r.dueOn)}
                            </Chip>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">{r.debit ? money(r.debit) : ""}</td>
                        <td className="px-3 py-2 text-right">{r.credit ? money(r.credit) : ""}</td>
                        <td className="px-3 py-2 text-right font-medium">{money(r.balance)}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-line bg-slate-50 font-semibold">
                    <td className="px-3 py-2" colSpan={3}>
                      Totales del período
                    </td>
                    <td className="px-3 py-2 text-right">{money(st.data.totalDebit)}</td>
                    <td className="px-3 py-2 text-right">{money(st.data.totalCredit)}</td>
                    <td className="px-3 py-2 text-right">{money(st.data.closingBalance)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
      <PaymentDialog target={pay} onClose={() => setPay(null)} onDone={notice.show} />
      <InvoiceDialog client={invoicing ? { id: client.id, name: client.name } : null} onClose={() => setInvoicing(false)} onDone={notice.show} />
      <Notice message={notice.message} />
    </Card>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cn("tabular-nums", strong ? "text-lg font-bold" : "font-semibold")}>{value}</dd>
    </div>
  );
}
