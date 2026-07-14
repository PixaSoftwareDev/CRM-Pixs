"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/auth/constants"
import { signIn, signOut } from "@/lib/auth/session"

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Ingresá la contraseña"),
})

export type LoginState = { error?: string }

// Server Action: valida con Zod, autentica contra la sesión local, redirige al dashboard.
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const user = await signIn(parsed.data.email, parsed.data.password)
  if (!user) {
    return { error: "Email o contraseña incorrectos" }
  }

  redirect("/dashboard")
}

// Server Action: acceso rápido para pruebas. Autentica al usuario demo usando
// las credenciales del server (env), sin exponer la contraseña al cliente.
export async function demoLogin() {
  const user = await signIn(DEMO_EMAIL, DEMO_PASSWORD)
  if (!user) {
    redirect("/login?demo=err")
  }
  redirect("/dashboard")
}

export async function logout() {
  await signOut()
  redirect("/login")
}
