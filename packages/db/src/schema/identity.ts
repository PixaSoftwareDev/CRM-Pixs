/**
 * Identidad: usuarios del equipo y tablas de sesión.
 * Compatible con Better Auth (adapter Drizzle, provider "pg"):
 *   drizzleAdapter(db, { provider: "pg", schema: { user: users, session: sessions,
 *     account: accounts, verification: verifications } })
 * con `advanced.database.generateId: false` para que los ids los genere la base (UUIDv7).
 */
import { boolean, index, pgEnum, pgTable, text, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { id, ref, timestamps, tstz } from "./_shared/columns";

export const userRole = pgEnum("user_role", ["admin", "miembro"]);

export const users = pgTable(
  "users",
  {
    id: id(),
    name: text().notNull(),
    email: text().notNull(),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    role: userRole().notNull().default("miembro"),
    /** Color del avatar en la UI (hex). */
    color: varchar({ length: 7 }),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: ref()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text().notNull(),
    expiresAt: tstz().notNull(),
    ipAddress: text(),
    userAgent: text(),
    ...timestamps,
  },
  (t) => [uniqueIndex("sessions_token_uq").on(t.token), index("sessions_user_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    userId: ref()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text().notNull(),
    providerId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: tstz(),
    refreshTokenExpiresAt: tstz(),
    scope: text(),
    /** Hash (nunca la contraseña en claro). Lo escribe Better Auth. */
    password: text(),
    ...timestamps,
  },
  (t) => [
    index("accounts_user_idx").on(t.userId),
    uniqueIndex("accounts_provider_account_uq").on(t.providerId, t.accountId),
  ],
);

export const verifications = pgTable(
  "verifications",
  {
    id: id(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: tstz().notNull(),
    ...timestamps,
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);
