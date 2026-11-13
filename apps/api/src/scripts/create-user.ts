/**
 * Alta (o cambio de contraseña) de un usuario del equipo. La contraseña se
 * pide por teclado sin mostrarla; nunca va como argumento (quedaría en el
 * historial de la terminal).
 *
 *   node dist/create-user.js "Guillermo" guillermo@pixs.com.ar admin
 */
import { createInterface } from "node:readline";
import { accounts, and, eq, users } from "@pixs/db";
import { closeDb, db } from "../lib/db";
import { auth } from "../modules/auth/auth";

const [name, email, role = "miembro"] = process.argv.slice(2);
if (!name || !email || !/^\S+@\S+\.\S+$/.test(email) || !["admin", "miembro"].includes(role)) {
  console.error('Uso: create-user "<Nombre>" <email> [admin|miembro]');
  process.exit(1);
}

/**
 * Un solo lector para todas las preguntas (con dos, el primero se come las
 * líneas del segundo cuando la entrada viene por tubería). Lo tipeado no se muestra.
 */
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
const out = rl as unknown as { _writeToOutput: (s: string) => void };
const write = out._writeToOutput.bind(rl);
let muted = false;
out._writeToOutput = (s: string) => {
  if (!muted) write(s);
};
// El iterador guarda las líneas que llegan antes de preguntar (entrada por tubería).
const lines = rl[Symbol.asyncIterator]();
async function askHidden(question: string): Promise<string> {
  process.stdout.write(question);
  muted = true;
  const { value } = await lines.next();
  muted = false;
  process.stdout.write("\n");
  return typeof value === "string" ? value : "";
}

const password = await askHidden(`Contraseña para ${email} (mínimo 12 caracteres): `);
if (password.length < 12) {
  console.error("La contraseña tiene que tener al menos 12 caracteres.");
  process.exit(1);
}
if ((await askHidden("Repetila: ")) !== password) {
  console.error("No coinciden.");
  process.exit(1);
}
rl.close();

const hash = await (await auth.$context).password.hash(password);
await db.transaction(async (tx) => {
  const [user] = await tx
    .insert(users)
    .values({ name, email: email.toLowerCase(), emailVerified: true, role: role as "admin" | "miembro" })
    .onConflictDoUpdate({ target: users.email, set: { name, role: role as "admin" | "miembro", active: true } })
    .returning({ id: users.id });
  if (!user) throw new Error("No se pudo crear el usuario");
  const updated = await tx
    .update(accounts)
    .set({ password: hash })
    .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")))
    .returning({ id: accounts.id });
  if (!updated.length) {
    await tx.insert(accounts).values({ userId: user.id, providerId: "credential", accountId: user.id, password: hash });
  }
});
console.log(`Usuario listo: ${name} <${email}> (${role}).`);
await closeDb();
