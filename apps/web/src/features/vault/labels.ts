import type { CredentialKind } from "@pixs/shared";

export const KIND: Record<CredentialKind, string> = {
  panel: "Panel",
  hosting: "Hosting",
  base_de_datos: "Base de datos",
  acceso_remoto: "Acceso remoto",
  tienda_apps: "Tienda de apps",
  email: "Email",
  red_social: "Red social",
  dominio: "Dominio",
  otro: "Otro",
};
