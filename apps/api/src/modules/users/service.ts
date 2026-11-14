/**
 * Usuarios internos: alta, rol, baja (desactivar) y cambio de contraseña.
 * No se borran: quedan en el historial de tareas, tickets y movimientos.
 */
import { accounts, and, type Db, eq, sessions, sql, users } from "@crm/db";
import { effectivePermissions, type UserCreate, type UserDto, type UserUpdate, userCreate, userUpdate } from "@crm/shared";
import { AppError, BadRequestError, ConflictError, isUniqueViolation, NotFoundError } from "../../lib/errors";
import { toIso } from "../../lib/sql";
import { auth } from "../auth/auth";
import { forgetAccess } from "../auth/guard";

/** Clave del advisory lock que serializa los cambios de usuarios (cualquier número fijo sirve). */
const ADMIN_CHANGE_LOCK = 7_310_001;

const hashPassword = async (password: string) => (await auth.$context).password.hash(password);

export async function listUsers(db: Db): Promise<UserDto[]> {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active, permissions: users.permissions, createdAt: users.createdAt })
    .from(users)
    .orderBy(sql`${users.active} desc`, users.name);
  return rows.map((r) => ({ ...r, permissions: effectivePermissions(r.role, r.permissions), createdAt: toIso(r.createdAt) }));
}

export async function createUser(db: Db, input: UserCreate): Promise<{ id: string }> {
  const data = userCreate.parse(input);
  const hash = await hashPassword(data.password);
  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ name: data.name, email: data.email, emailVerified: true, role: data.role, permissions: data.permissions ?? null })
        .returning({ id: users.id });
      if (!user) throw new Error("No se pudo crear el usuario");
      await tx.insert(accounts).values({ userId: user.id, providerId: "credential", accountId: user.id, password: hash });
      return user;
    });
  } catch (err) {
    if (isUniqueViolation(err, "users_email_uq")) throw new ConflictError("Ya hay un usuario con ese email");
    throw err;
  }
}

export async function updateUser(db: Db, actorId: string, id: string, input: UserUpdate): Promise<void> {
  const data = userUpdate.parse(input);
  const hash = data.password ? await hashPassword(data.password) : null;

  await db.transaction(async (tx) => {
    // Cambios de rol o de baja, de a uno: si no, dos administradores que se quitan el
    // rol a la vez ven cada uno al otro como "el que queda" y el sistema queda sin admins.
    await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_CHANGE_LOCK})`);
    // Mientras esperaba el lock, a quien hace el cambio le pudieron sacar el rol.
    const [actor] = await tx.select({ role: users.role, active: users.active }).from(users).where(eq(users.id, actorId));
    if (actor?.role !== "admin" || !actor.active) throw new AppError(403, "Solo un administrador puede hacer esto");
    const [before] = await tx
      .select({ role: users.role, active: users.active, permissions: users.permissions })
      .from(users)
      .where(eq(users.id, id))
      .for("update");
    if (!before) throw new NotFoundError("Usuario");

    const role = data.role ?? before.role;
    const active = data.active ?? before.active;
    const losesAdmin = before.role === "admin" && before.active && (role !== "admin" || !active);
    if (losesAdmin) {
      if (id === actorId) throw new BadRequestError("No podés quitarte a vos mismo el acceso de administrador");
      const [others] = await tx.execute<{ n: string }>(
        sql`select count(*) as n from users where role = 'admin' and active and id <> ${id}`,
      );
      if (Number(others?.n ?? 0) === 0) throw new ConflictError("Tiene que quedar al menos un administrador activo");
    }

    const patch: Partial<typeof users.$inferInsert> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.role !== undefined) patch.role = data.role;
    if (data.active !== undefined) patch.active = data.active;
    if (data.permissions !== undefined) patch.permissions = data.permissions;
    if (Object.keys(patch).length) await tx.update(users).set({ ...patch, updatedAt: new Date() }).where(eq(users.id, id));

    if (hash) {
      const updated = await tx
        .update(accounts)
        .set({ password: hash })
        .where(and(eq(accounts.userId, id), eq(accounts.providerId, "credential")))
        .returning({ id: accounts.id });
      if (!updated.length) {
        await tx.insert(accounts).values({ userId: id, providerId: "credential", accountId: id, password: hash });
      }
    }

    // Baja, cambio de rol, de permisos o de contraseña: se cierran sus sesiones y tiene que volver a entrar.
    const permissionsChanged =
      data.permissions !== undefined &&
      JSON.stringify(effectivePermissions(role, data.permissions)) !== JSON.stringify(effectivePermissions(before.role, before.permissions));
    if (hash || active !== before.active || role !== before.role || permissionsChanged) {
      await tx.delete(sessions).where(eq(sessions.userId, id));
    }
  });
  // Los permisos nuevos rigen desde el próximo request.
  forgetAccess(id);
}
