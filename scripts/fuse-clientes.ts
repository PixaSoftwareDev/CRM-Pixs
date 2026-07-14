/**
 * Fusión Empresa + Contacto → Cliente. Sobre la base actual:
 *  1. agrega la columna `persona_contacto`,
 *  2. donde había `empresa` (texto), vuelca: nombre → persona_contacto, empresa → nombre,
 *  3. elimina las columnas `empresa`/`empresa_id` y la tabla `empresas`.
 * Idempotente. Uso: npx tsx scripts/fuse-clientes.ts
 */
import Database from "better-sqlite3"

const sqlite = new Database(process.env.SQLITE_PATH ?? "demo.sqlite")

function hasColumn(table: string, col: string): boolean {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return cols.some((c) => c.name === col)
}

// 1. Nueva columna
if (!hasColumn("contacts", "persona_contacto")) {
  sqlite.exec("ALTER TABLE contacts ADD COLUMN persona_contacto text")
}

// 2. Voltear: el registro pasa a ser el negocio; la persona va a persona_contacto.
if (hasColumn("contacts", "empresa")) {
  const res = sqlite
    .prepare(
      `UPDATE contacts
       SET persona_contacto = nombre, nombre = empresa
       WHERE empresa IS NOT NULL AND trim(empresa) <> ''
         AND (persona_contacto IS NULL OR persona_contacto = '')`,
    )
    .run()
  console.log(`Clientes volteados (persona ↔ negocio): ${res.changes}`)
}

// 3. Limpiar el modelo viejo.
sqlite.pragma("foreign_keys = OFF")
if (hasColumn("contacts", "empresa_id")) sqlite.exec("ALTER TABLE contacts DROP COLUMN empresa_id")
if (hasColumn("contacts", "empresa")) sqlite.exec("ALTER TABLE contacts DROP COLUMN empresa")
sqlite.exec("DROP TABLE IF EXISTS empresas")
sqlite.pragma("foreign_keys = ON")

console.log("Fusión a Clientes OK.")
