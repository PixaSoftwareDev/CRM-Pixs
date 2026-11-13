/**
 * Crea (o actualiza la contraseña de) el usuario de prueba del acceso rápido.
 * Toma las credenciales de apps/web/.env.development.local para que front y
 * base usen siempre las mismas. Se niega a correr en producción.
 */
import { accounts, and, eq, users } from "@pixs/db";
import { env } from "../env";
import { closeDb, db } from "../lib/db";
import { auth } from "../modules/auth/auth";

if (env.NODE_ENV === "production") {
  console.error("seed-dev-user no se corre en producción.");
  process.exit(1);
}

const email = process.env.VITE_DEV_LOGIN_EMAIL;
const password = process.env.VITE_DEV_LOGIN_PASSWORD;
if (!email || !password) {
  console.error("Faltan VITE_DEV_LOGIN_EMAIL / VITE_DEV_LOGIN_PASSWORD en apps/web/.env.development.local");
  process.exit(1);
}

const ctx = await auth.$context;
const hash = await ctx.password.hash(password);

await db.transaction(async (tx) => {
  const [user] = await tx
    .insert(users)
    .values({ name: "Usuario de prueba", email, emailVerified: true, role: "admin" })
    .onConflictDoUpdate({ target: users.email, set: { active: true } })
    .returning({ id: users.id });
  if (!user) throw new Error("No se pudo crear el usuario");

  const updated = await tx
    .update(accounts)
    .set({ password: hash })
    .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")))
    .returning({ id: accounts.id });

  if (updated.length === 0) {
    await tx
      .insert(accounts)
      .values({ userId: user.id, providerId: "credential", accountId: user.id, password: hash });
  }
});

console.log(`Usuario de prueba listo: ${email}`);
await closeDb();
