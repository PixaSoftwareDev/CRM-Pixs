import { createAuthClient } from "better-auth/react";
import { BASE } from "./base";

/** Cliente de Better Auth. Mismo origen: en dev, Vite hace proxy de /api a la API. */
export const authClient = createAuthClient({ basePath: `${BASE}/api/auth` });
