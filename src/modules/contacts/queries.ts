import { desc, eq, like, or } from "drizzle-orm"
import { db } from "@/db"
import { contacts } from "@/db/schema"

export async function listContacts(search?: string) {
  if (search && search.trim().length > 0) {
    const q = `%${search.trim()}%`
    // SQLite LIKE es case-insensitive para ASCII, así que alcanza para el buscador.
    return db
      .select()
      .from(contacts)
      .where(or(like(contacts.nombre, q), like(contacts.empresa, q), like(contacts.email, q)))
      .orderBy(desc(contacts.createdAt))
  }
  return db.select().from(contacts).orderBy(desc(contacts.createdAt))
}

export async function getContact(id: string) {
  const [row] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1)
  return row ?? null
}
