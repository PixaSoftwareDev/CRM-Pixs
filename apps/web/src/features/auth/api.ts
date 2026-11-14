import { authClient } from "../../lib/auth-client";
import type { LoginInput } from "./login-schema";

/** Inicia sesión; la API deja la sesión en una cookie httpOnly. */
export async function signIn(input: LoginInput): Promise<void> {
  const { error } = await authClient.signIn.email(input);
  if (!error) return;
  if (error.status === 401) throw new Error("Email o contraseña incorrectos");
  // 403: la contraseña es correcta pero el usuario está dado de baja (el server manda el motivo).
  if (error.status === 403) throw new Error(error.message || "Tu usuario está dado de baja. Si es un error, hablá con un administrador.");
  if (error.status === 429) throw new Error("Demasiados intentos. Esperá un minuto.");
  throw new Error("No se pudo iniciar sesión. Probá de nuevo.");
}

export async function signOut(): Promise<void> {
  await authClient.signOut();
}
