import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Ingresá un email válido"),
  password: z.string().min(1, "Ingresá tu contraseña"),
  /** Sí: la sesión dura 30 días en este navegador. No: se cierra al cerrar el navegador. */
  rememberMe: z.boolean(),
});

export type LoginInput = z.infer<typeof loginSchema>;
