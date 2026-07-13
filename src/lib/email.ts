import "server-only"
import { Resend } from "resend"
import { serverEnv } from "@/lib/env"

/**
 * Envío de emails con Resend (§1). No-op con aviso si falta la API key,
 * para no romper en entornos sin configurar.
 */
export async function sendEmail(input: { subject: string; html: string; to?: string[] }) {
  const env = serverEnv()
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL_FROM) {
    console.warn("[email] RESEND_API_KEY / ALERT_EMAIL_FROM no configurados; se omite el envío")
    return { skipped: true }
  }
  const to = input.to ?? env.ALERT_EMAIL_TO?.split(",").map((s) => s.trim()) ?? []
  if (to.length === 0) return { skipped: true }

  const resend = new Resend(env.RESEND_API_KEY)
  await resend.emails.send({
    from: env.ALERT_EMAIL_FROM,
    to,
    subject: input.subject,
    html: input.html,
  })
  return { sent: true }
}
