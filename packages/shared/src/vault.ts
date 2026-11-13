/** Contratos de Accesos (claves de clientes, cifradas en la API). */
import { z } from "zod";

export const CREDENTIAL_KINDS = [
  "panel",
  "hosting",
  "base_de_datos",
  "acceso_remoto",
  "tienda_apps",
  "email",
  "red_social",
  "dominio",
  "otro",
] as const;
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

/** Esquemas permitidos para "Conectar" (nada de javascript: ni data:). */
const CONNECT_SCHEMES = ["https:", "http:", "anydesk:", "rdp:", "ssh:", "vnc:"];
const connectUrl = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => {
      if (v === "") return true;
      try {
        return CONNECT_SCHEMES.includes(new URL(v).protocol);
      } catch {
        return false;
      }
    },
    { message: "Usá un link https://, anydesk:, rdp:, ssh: o vnc:" },
  );

export const credentialCreate = z.object({
  clientId: z.uuid({ message: "Elegí el cliente" }),
  kind: z.enum(CREDENTIAL_KINDS),
  label: z.string().trim().min(1, { message: "Contá qué es (ej: PC recepción)" }).max(120),
  username: z.string().trim().max(200).optional(),
  secret: z.string().min(1, { message: "Falta la clave" }).max(2000),
  connectUrl: connectUrl.optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type CredentialCreate = z.input<typeof credentialCreate>;

/** Editar: la clave solo cambia si viene `secret`. */
export const credentialUpdate = credentialCreate.omit({ clientId: true }).partial();
export type CredentialUpdate = z.input<typeof credentialUpdate>;

export const credentialReveal = z.object({ action: z.enum(["ver", "copiar"]) });
export type CredentialReveal = z.input<typeof credentialReveal>;

export const accessLogQuery = z.object({
  q: z.string().trim().max(100).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  clientId: z.uuid().optional(),
  userId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});
export type AccessLogQuery = z.input<typeof accessLogQuery>;
