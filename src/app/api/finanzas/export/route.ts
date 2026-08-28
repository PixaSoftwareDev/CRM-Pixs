import { requireUser } from "@/lib/auth"
import { listTransactions } from "@/modules/money/queries"

// Export CSV para el contador (§7 Fase 3). Requiere sesión.
export async function GET() {
  await requireUser()
  const txs = await listTransactions()

  const header = ["fecha", "tipo", "monto", "moneda", "categoria", "autor", "descripcion"]
  const csvCell = (v: unknown) => {
    const s = String(v ?? "")
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = txs.map((t) =>
    [t.fecha, t.tipo, t.monto, t.moneda, t.categoria, t.autor, t.descripcion]
      .map(csvCell)
      .join(","),
  )
  const csv = [header.join(","), ...rows].join("\n")

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="movimientos.csv"',
    },
  })
}
