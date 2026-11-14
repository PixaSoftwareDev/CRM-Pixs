/**
 * Permisos por sector. Cada usuario tiene un nivel en cada sector del CRM:
 * sin acceso < ver < editar < administrar. Un administrador tiene todo.
 * La misma tabla la usan la API (para autorizar) y el front (para mostrar).
 */
import { z } from "zod";

export const AREAS = ["tareas", "clientes", "embudo", "tickets", "proyectos", "finanzas", "accesos", "automatizaciones"] as const;
export type Area = (typeof AREAS)[number];

export const LEVELS = ["none", "read", "edit", "manage"] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_LABEL: Record<Level, string> = {
  none: "Sin acceso",
  read: "Solo ver",
  edit: "Ver y editar",
  manage: "Administrar",
};

/** Qué es cada sector, qué niveles admite y qué suma "Administrar" (lo que antes era solo del administrador). */
export const AREA_INFO: Record<Area, { label: string; levels: readonly Level[]; manage?: string }> = {
  tareas: { label: "Mi día, agenda y tareas", levels: LEVELS, manage: "crear y borrar tipos de tarea" },
  clientes: { label: "Clientes", levels: ["none", "read", "edit"] },
  embudo: { label: "Embudo de ventas", levels: ["none", "read", "edit"] },
  tickets: { label: "Tickets", levels: ["none", "read", "edit"] },
  proyectos: { label: "Proyectos", levels: ["none", "read", "edit"] },
  finanzas: { label: "Finanzas y cuenta corriente", levels: LEVELS, manage: "abonos, aumentos y devengamiento" },
  accesos: { label: "Accesos (claves)", levels: LEVELS, manage: "borrar claves y ver el historial" },
  automatizaciones: { label: "Automatizaciones", levels: ["none", "read", "manage"], manage: "activar, pausar y ejecutar reglas" },
};

export type Permissions = Record<Area, Level>;

const all = (pick: (area: Area) => Level): Permissions =>
  Object.fromEntries(AREAS.map((a) => [a, pick(a)])) as Permissions;

/** El nivel más alto que el sector admite sin pasar de `max`. */
const cap = (area: Area, max: Level): Level =>
  [...AREA_INFO[area].levels].reverse().find((l) => LEVELS.indexOf(l) <= LEVELS.indexOf(max)) ?? "none";

/** Perfiles listos para aplicar de un clic. "Editor" es lo que tenía un miembro hasta ahora. */
export const PRESETS = {
  editor: { label: "Editor", hint: "Ve y edita todo; no toca la configuración.", permissions: all((a) => cap(a, "edit")) },
  lectura: { label: "Solo lectura", hint: "Ve todo, no cambia nada.", permissions: all((a) => cap(a, "read")) },
} as const;
export type PresetKey = keyof typeof PRESETS;

export const FULL_ACCESS: Permissions = all((a) => cap(a, "manage"));
export const DEFAULT_PERMISSIONS: Permissions = PRESETS.editor.permissions;

export const permissionsSchema = z
  .object(Object.fromEntries(AREAS.map((a) => [a, z.enum(LEVELS)])) as Record<Area, z.ZodEnum<{ [K in Level]: K }>>)
  .superRefine((p, ctx) => {
    for (const a of AREAS) {
      if (!AREA_INFO[a].levels.includes(p[a])) ctx.addIssue({ code: "custom", path: [a], message: "Nivel inválido para este sector" });
    }
  });

/** Permisos efectivos: el admin tiene todo; un miembro, lo guardado (o "Editor" si nunca se lo configuró). */
export function effectivePermissions(role: string, stored: unknown): Permissions {
  if (role === "admin") return FULL_ACCESS;
  const parsed = permissionsSchema.safeParse(stored);
  return parsed.success ? parsed.data : DEFAULT_PERMISSIONS;
}

export const hasLevel = (have: Level, need: Level): boolean => LEVELS.indexOf(have) >= LEVELS.indexOf(need);

/** Con qué perfil coincide (para mostrarlo en la lista), o null si es a medida. */
export function presetOf(p: Permissions): PresetKey | null {
  return (Object.keys(PRESETS) as PresetKey[]).find((k) => AREAS.every((a) => PRESETS[k].permissions[a] === p[a])) ?? null;
}
