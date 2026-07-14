import type { CredentialType } from "@/db/schema"

/** Etiqueta legible por tipo de acceso. */
export const CREDENTIAL_TYPE_LABELS: Record<CredentialType, string> = {
  servidor: "Servidor",
  base: "Base de datos",
  servicio: "Servicio / API",
  web: "Web / Panel",
  email: "Email",
  otro: "Otro",
}

/** Tono del badge por tipo (usa la paleta de <Badge>). */
export const CREDENTIAL_TYPE_TONE: Record<
  CredentialType,
  "blue" | "green" | "amber" | "violet" | "red" | "neutral"
> = {
  servidor: "blue",
  base: "green",
  servicio: "violet",
  web: "amber",
  email: "red",
  otro: "neutral",
}
