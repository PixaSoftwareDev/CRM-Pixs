import type { ProjectDetail } from "@crm/shared";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Chip } from "../../components/ui/Chip";
import { Field, Input } from "../../components/ui/Field";
import { ErrorBox, Skeleton } from "../../components/ui/States";
import { day, money, parsePesos } from "../../lib/format";
import { addMonths, todayAr } from "../tasks/time";
import { useCreatePlan, useInstallmentPlans } from "./api";
import { type PaymentTarget, PaymentDialog } from "./dialogs";

interface Item {
  number: number;
  amount: number;
  dueOn: string;
}

/**
 * Arma las cuotas: anticipo (opcional) hoy y N cuotas mensuales iguales desde
 * la fecha elegida. El redondeo va a la última cuota para que el total cierre.
 */
export function buildInstallments(totalCents: number, advancePct: number, count: number, firstDue: string, today: string): Item[] {
  const items: Item[] = [];
  const advance = Math.round((totalCents * advancePct) / 100 / 100) * 100;
  if (advance > 0) items.push({ number: 0, amount: advance, dueOn: today });
  const rest = totalCents - advance;
  if (count <= 0 || rest <= 0) return items;
  const each = Math.floor(rest / count / 100) * 100;
  // Día 29-31 no existe en todos los meses: se usa hasta el 28 (como los abonos).
  const dd = String(Math.min(Number(firstDue.slice(8)), 28)).padStart(2, "0");
  for (let i = 1; i <= count; i++) {
    items.push({ number: i, amount: i === count ? rest - each * (count - 1) : each, dueOn: `${addMonths(firstDue, i - 1).slice(0, 8)}${dd}` });
  }
  return items;
}

const STATUS = {
  pendiente: { label: "Sin facturar", tone: "slate" },
  facturada: { label: "Facturada", tone: "amber" },
  cobrada: { label: "Cobrada", tone: "green" },
} as const;

export function InstallmentsCard({ project: p, onNotice }: { project: ProjectDetail; onNotice: (m: string) => void }) {
  const plans = useInstallmentPlans(p.id);
  const create = useCreatePlan(p.id);
  const [pay, setPay] = useState<PaymentTarget | null>(null);
  const today = todayAr();
  const [total, setTotal] = useState(p.sale.amount ? String(p.sale.amount / 100) : "");
  const [advance, setAdvance] = useState("0");
  const [count, setCount] = useState("3");
  const [firstDue, setFirstDue] = useState(addMonths(today, 1).slice(0, 8) + "10");
  const [desc, setDesc] = useState(p.sale.paymentTerms ?? "");

  if (plans.error) return <ErrorBox error={plans.error} onRetry={() => void plans.refetch()} />;
  if (plans.isPending) return <Skeleton className="h-32" />;

  const totalCents = parsePesos(total) ?? 0;
  const preview = buildInstallments(totalCents, Number(advance) || 0, Number(count) || 0, firstDue, today);
  const canCreate = totalCents > 0 && preview.length > 0 && desc.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(firstDue);

  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="font-bold">Plan de cuotas</h2>
      {plans.data.length === 0 ? (
        <>
          <p className="text-sm text-muted">Armá las cuotas de la venta: aparecen en Finanzas → Por cobrar y se facturan al cobrarlas.</p>
          <div className="grid gap-3 sm:grid-cols-5">
            <Field label="Descripción" className="sm:col-span-2">
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="50% anticipo + 2 cuotas" />
            </Field>
            <Field label="Total ($)">
              <Input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
            </Field>
            <Field label="Anticipo (%)">
              <Input inputMode="numeric" value={advance} onChange={(e) => setAdvance(e.target.value.replace(/\D/g, "").slice(0, 3))} />
            </Field>
            <Field label="Cuotas">
              <Input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, "").slice(0, 2))} />
            </Field>
            <Field label="Primer vencimiento">
              <Input type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
            </Field>
          </div>
          {preview.length > 0 && totalCents > 0 && (
            <ul className="flex flex-wrap gap-2 text-xs">
              {preview.map((i) => (
                <li key={i.number} className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                  {i.number === 0 ? "Anticipo" : `Cuota ${i.number}`} · {money(i.amount)} · {day(i.dueOn)}
                </li>
              ))}
            </ul>
          )}
          {create.error && <p role="alert" className="text-sm text-red-700">{create.error.message}</p>}
          <Button
            className="self-start"
            disabled={!canCreate || create.isPending}
            onClick={() => create.mutate({ description: desc.trim(), items: preview }, { onSuccess: () => onNotice("Plan de cuotas creado.") })}
          >
            Crear plan de cuotas
          </Button>
        </>
      ) : (
        plans.data.map((plan) => (
          <div key={plan.id} className="flex flex-col gap-2">
            <p className="text-sm">
              <strong>{plan.description}</strong> · cobrado {money(plan.collected)} de {money(plan.total)}
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
              <div className="h-full rounded-full bg-green-500" style={{ width: `${(plan.collected / plan.total) * 100}%` }} />
            </div>
            <ul className="divide-y divide-slate-100">
              {plan.installments.map((i) => {
                const overdue = i.status !== "cobrada" && i.dueOn < today;
                return (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      {i.number === 0 ? "Anticipo" : `Cuota ${i.number}`}
                      <span className={overdue ? "ml-2 font-semibold text-red-700" : "ml-2 text-muted"}>
                        vence {day(i.dueOn)}
                        {overdue && " · vencida"}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Chip tone={STATUS[i.status].tone}>{STATUS[i.status].label}</Chip>
                      <strong className="w-24 text-right tabular-nums">{money(i.amount)}</strong>
                      {i.status !== "cobrada" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setPay({
                              clientId: p.client.id,
                              clientName: p.client.name,
                              concept: i.number === 0 ? "Anticipo" : `Cuota ${i.number}`,
                              amount: i.pending,
                              installmentId: i.id,
                            })
                          }
                        >
                          Cobrada
                        </Button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
      <PaymentDialog target={pay} onClose={() => setPay(null)} onDone={onNotice} />
    </Card>
  );
}
