import { accounts, eq, sessions, users, verifications } from "@crm/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { env } from "../../env";
import { db } from "../../lib/db";
import { CLIENT_IP_HEADER } from "../../lib/http";

const DAY = 60 * 60 * 24;

/** Lo que ve en el login alguien a quien un administrador dio de baja. */
export const INACTIVE_USER_MESSAGE = "Tu usuario está dado de baja. Si es un error, hablá con un administrador.";

export const auth = betterAuth({
  appName: "CRM",
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  trustedOrigins: [env.WEB_ORIGIN],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: users, session: sessions, account: accounts, verification: verifications },
  }),
  emailAndPassword: {
    enabled: true,
    // CRM interno: no hay registro público; los usuarios los crea un admin.
    disableSignUp: true,
    minPasswordLength: 8,
  },
  user: {
    additionalFields: {
      role: { type: "string", input: false },
      active: { type: "boolean", input: false },
    },
  },
  databaseHooks: {
    session: {
      create: {
        // Un usuario dado de baja no puede abrir sesión (la contraseña ya se validó: no se filtra quién existe).
        before: async (session) => {
          const [row] = await db.select({ active: users.active }).from(users).where(eq(users.id, session.userId));
          if (!row?.active) throw new APIError("FORBIDDEN", { message: INACTIVE_USER_MESSAGE, code: "USER_INACTIVE" });
        },
      },
    },
  },
  session: {
    // La sesión se recuerda 30 días en el navegador donde se inició.
    expiresIn: 30 * DAY,
    updateAge: DAY,
    // Sin copia de la sesión en la cookie: cada request la valida contra la base, así una
    // baja, un cambio de rol/permisos o de contraseña (que borran sus sesiones) rigen al instante.
    cookieCache: { enabled: false },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: { "/sign-in/email": { window: 60, max: 5 } },
  },
  advanced: {
    // Cookies "Secure" solo si la app se sirve por HTTPS (si no, el navegador no las manda).
    useSecureCookies: env.BETTER_AUTH_URL.startsWith("https://"),
    cookiePrefix: "crm",
    // Los ids los genera el schema (UUIDv7).
    database: { generateId: false },
    // La IP la pone el adaptador (`toFetchHeaders`) a partir de `request.ip`: nunca la que manda el cliente.
    ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
  },
});

export type Session = typeof auth.$Infer.Session;
