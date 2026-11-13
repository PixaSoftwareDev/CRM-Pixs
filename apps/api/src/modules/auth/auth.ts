import { accounts, sessions, users, verifications } from "@pixs/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { env } from "../../env";
import { db } from "../../lib/db";

const DAY = 60 * 60 * 24;

export const auth = betterAuth({
  appName: "Pixs CRM",
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
    minPasswordLength: 12,
  },
  user: {
    additionalFields: {
      role: { type: "string", input: false },
      active: { type: "boolean", input: false },
    },
  },
  session: {
    // "Recordarme" en el login: 30 días; sin tildarlo, la cookie muere al cerrar el navegador.
    expiresIn: 30 * DAY,
    updateAge: DAY,
    // Evita ir a la base en cada request: la sesión se valida desde una cookie firmada por 5 min.
    cookieCache: { enabled: true, maxAge: 5 * 60 },
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
    cookiePrefix: "pixs",
    // Los ids los genera el schema (UUIDv7).
    database: { generateId: false },
  },
});

export type Session = typeof auth.$Infer.Session;
