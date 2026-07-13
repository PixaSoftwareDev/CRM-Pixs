"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
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

export async function logout() {
  await signOut()
  redirect("/login")
}
