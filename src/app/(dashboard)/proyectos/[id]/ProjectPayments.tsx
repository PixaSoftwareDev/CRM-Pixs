import { Card } from "@/components/ui"
import { formatMoney } from "@/lib/utils"
import { getProjectBudget } from "@/modules/money/queries"
import { BudgetForm, InstallmentRow } from "./PaymentsClient"

/** Vista de pagos del proyecto: presupuesto + cuotas (§7 Fase 3). */
export async function ProjectPayments({ projectId }: { projectId: string }) {
  const data = await getProjectBudget(projectId)

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Pagos</h2>
        {!data ? <BudgetForm projectId={projectId} /> : null}
      </div>

      {!data ? (
        <p className="text-sm text-zinc-400">Sin presupuesto cargado.</p>
      ) : (
        <div>
          <div className="mb-3 text-sm">
            Total: <strong>{formatMoney(data.budget.montoTotal, data.budget.moneda)}</strong>
            <span className="text-zinc-400"> · {data.cuotas.length} cuota(s)</span>
          </div>
          <div>
            {data.cuotas.map((c) => (
              <InstallmentRow
                key={c.id}
                cuota={c}
                moneda={data.budget.moneda}
                projectId={projectId}
              />
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
