import { redirect } from "next/navigation"

// La raíz manda al dashboard; el middleware redirige a /login si no hay sesión.
export default function Home() {
  redirect("/dashboard")
}
