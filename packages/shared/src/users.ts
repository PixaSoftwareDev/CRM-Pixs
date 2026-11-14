/** Usuarios internos del CRM: los da de alta y administra un administrador. */
import { z } from "zod";
import { type Permissions, permissionsSchema } from "./permissions";

export const USER_ROLES = ["admin", "miembro"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Mismo mínimo que exige el inicio de sesión. */
const password = z
  .string()
  .min(8, { message: "Mínimo 8 caracteres" })
  .max(128, { message: "Máximo 128 caracteres" })
  .refine((v) => v.trim().length > 0, { message: "La contraseña no puede ser solo espacios" });

const name = z.string().trim().min(1, { message: "Poné el nombre" }).max(80);

export const userCreate = z.object({
  name,
  // Primero se limpian espacios y mayúsculas, después se valida (si no, " a@b.com" da "Email inválido").
  email: z.string().trim().toLowerCase().max(200).pipe(z.email({ message: "Email inválido" })),
  role: z.enum(USER_ROLES),
  password,
  /** Permisos por sector (no aplican a un administrador). Sin esto queda como "Editor". */
  permissions: permissionsSchema.optional(),
});
export type UserCreate = z.input<typeof userCreate>;

export const userUpdate = z
  .object({
    name,
    role: z.enum(USER_ROLES),
    active: z.boolean(),
    permissions: permissionsSchema,
    /** Nueva contraseña (la define el administrador y se la pasa a la persona). */
    password,
  })
  .partial();
export type UserUpdate = z.input<typeof userUpdate>;

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  /** Permisos efectivos por sector. */
  permissions: Permissions;
  createdAt: string;
}
