import { sendEmail } from "@/lib/email"
import { serverEnv } from "@/lib/env"
import { formatDate, formatMoney } from "@/lib/utils"
import { markOverdueInstallments, upcomingAndOverdue } from "@/modules/money/alerts"

// Alertas diarias de pagos (§7 Fase 3). Lo dispara pg_cron/Vercel Cron:
//   select net.http_post('https://.../api/cron/alertas-pagos',
//     headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.cron_secret')));
export async function POST(req: Request) {
  const env = serverEnv()
  const auth = req.headers.get("authorization")
  if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("No autorizado", { status: 401 })
  }

  const marcadas = await markOverdueInstallments()
  const cuotas = await upcomingAndOverdue(7)

  if (cuotas.length > 0) {
    const filas = cuotas
      .map(
        (c) =>
          `<tr><td>${c.proyecto}</td><td>${formatMoney(c.monto, c.moneda)}</td><td>${formatDate(
            c.venceAt,
          )}</td><td>${c.estado}</td></tr>`,
      )
      .join("")
    await sendEmail({
      subject: `Pixs CRM · ${cuotas.length} cuota(s) por cobrar`,
      html: `<h2>Cuentas por cobrar</h2>
        <table border="1" cellpadding="6" cellspacing="0">
          <tr><th>Proyecto</th><th>Monto</th><th>Vence</th><th>Estado</th></tr>
          ${filas}
        </table>`,
    })
  }

  return Response.json({ ok: true, marcadasVencidas: marcadas, alertadas: cuotas.length })
}
