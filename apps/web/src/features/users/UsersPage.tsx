import { zodResolver } from "@hookform/resolvers/zod";
import {
  AREA_INFO,
  AREAS,
  type Area,
  FULL_ACCESS,
  LEVEL_LABEL,
  type Level,
  type Permissions,
  PRESETS,
  type PresetKey,
  presetOf,
  type UserCreate,
  type UserDto,
  type UserUpdate,
  userCreate,
} from "@crm/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { PageHeader } from "../../components/layout/AppLayout";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Chip } from "../../components/ui/Chip";
import { cn } from "../../components/ui/cn";
import { Dialog, DialogActions } from "../../components/ui/Dialog";
import { Field, Input, Select } from "../../components/ui/Field";
import { Notice, useNotice } from "../../components/ui/Notice";
import { Empty, ErrorBox, Skeleton } from "../../components/ui/States";
import { useIsAdmin } from "../../hooks/useIsAdmin";
import { api } from "../../lib/api";
import { day, initials } from "../../lib/format";
import { useServerErrors } from "../clients/useServerErrors";
import { taskKeys, useMyId } from "../tasks/api";
import { useTitle } from "../../hooks/useTitle";

const KEY = ["users"] as const;
/** Perfil = rol + permisos: administrador (todo), uno de los perfiles listos, o a medida. */
type Profile = "admin" | PresetKey | "custom";
const PROFILE: Record<Profile, { label: string; hint: string; tone: "indigo" | "blue" | "slate" | "amber" }> = {
  admin: { label: "Administrador", hint: "Todo, incluidos los usuarios y sus permisos.", tone: "indigo" },
  editor: { ...PRESETS.editor, tone: "blue" },
  lectura: { ...PRESETS.lectura, tone: "slate" },
  custom: { label: "A medida", hint: "Elegís el nivel sector por sector.", tone: "amber" },
};
const profileOf = (u: Pick<UserDto, "role" | "permissions">): Profile => (u.role === "admin" ? "admin" : (presetOf(u.permissions) ?? "custom"));

function useSaveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UserUpdate & { id: string }) => api.patch(`/api/users/${id}`, body),
    // El equipo aparece en los desplegables de responsable de toda la app.
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: KEY }), qc.invalidateQueries({ queryKey: taskKeys.team })]),
  });
}

export function UsersPage() {
  useTitle("Usuarios");
  const isAdmin = useIsAdmin();
  const me = useMyId();
  const notice = useNotice();
  const users = useQuery({ queryKey: KEY, queryFn: () => api.get<UserDto[]>("/api/users"), enabled: isAdmin });
  const save = useSaveUser();
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<UserDto | null>(null);
  const [permsOf, setPermsOf] = useState<UserDto | null>(null);
  // Confirmación de la baja en la misma fila (antes, el cartel nativo del navegador).
  const [deactivating, setDeactivating] = useState<string | null>(null);

  if (!isAdmin) return <Empty>Los usuarios del sistema los administra un administrador.</Empty>;
  if (users.error) return <ErrorBox error={users.error} onRetry={() => void users.refetch()} />;
  if (users.isPending) return <Skeleton className="h-64" />;

  const active = users.data.filter((u) => u.active).length;

  return (
    <>
      <PageHeader
        title="Usuarios"
        subtitle={`Las personas del equipo que entran al CRM. ${active} con acceso.`}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden /> Nuevo usuario
          </Button>
        }
      />
      <p className="text-sm text-muted">
        Cada persona tiene un perfil: <strong className="text-ink">Administrador</strong> (todo),{" "}
        <strong className="text-ink">Editor</strong> (ve y edita), <strong className="text-ink">Solo lectura</strong> o{" "}
        <strong className="text-ink">A medida</strong>, eligiendo el nivel de cada sector con el botón Permisos.
      </p>
      {save.error && (
        <p role="alert" className="rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700">
          {save.error.message}
        </p>
      )}

      <Card className="lg:overflow-x-auto">
        {/* En el celular cada usuario es una ficha (stack-table), sin scroll de costado. */}
        <table className="stack-table w-full border-collapse text-sm lg:min-w-[820px]">
          <thead>
            <tr className="border-b border-line bg-slate-50 text-left text-[11px] font-semibold tracking-wider text-muted uppercase">
              <th scope="col" className="px-4 py-2.5">Usuario</th>
              <th scope="col" className="px-4 py-2.5">Perfil</th>
              <th scope="col" className="px-4 py-2.5">Estado</th>
              <th scope="col" className="px-4 py-2.5">Alta</th>
              <th scope="col" className="px-4 py-2.5 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.data.map((u) => {
              const busy = save.isPending && save.variables?.id === u.id;
              const self = u.id === me;
              return (
                <tr key={u.id} className="border-t border-slate-100">
                  <td data-cell="full" className="px-4 py-3">
                    <span className="flex items-center gap-3">
                      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-800">
                        {initials(u.name)}
                      </span>
                      <span className="min-w-0">
                        <strong className={u.active ? "block" : "block text-muted line-through"}>
                          {u.name}
                          {self && <span className="font-normal text-muted"> (vos)</span>}
                        </strong>
                        <span className="block text-xs break-all text-muted">{u.email}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Chip tone={PROFILE[profileOf(u)].tone}>{PROFILE[profileOf(u)].label}</Chip>
                  </td>
                  <td className="px-4 py-3">
                    <Chip tone={u.active ? "green" : "slate"}>{u.active ? "Con acceso" : "Dado de baja"}</Chip>
                  </td>
                  <td data-cell="end" data-label="Alta:" className="px-4 py-3 text-muted max-lg:text-xs">{day(u.createdAt.slice(0, 10))}</td>
                  <td data-cell="full" className="px-4 py-3">
                    <span className="flex flex-wrap justify-end gap-1.5 max-lg:justify-start">
                      <Button size="sm" variant="secondary" disabled={busy || !u.active || self} onClick={() => setPermsOf(u)}>
                        <ShieldCheck size={13} aria-hidden /> Permisos
                      </Button>
                      <Button size="sm" variant="secondary" disabled={busy || !u.active} onClick={() => setResetting(u)}>
                        <KeyRound size={13} aria-hidden /> Contraseña
                      </Button>
                      {!self && deactivating === u.id && (
                        <span className="flex flex-wrap items-center gap-1.5 text-xs">
                          ¿Dar de baja a {u.name}? No va a poder entrar hasta que lo reactives.
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={busy}
                            onClick={() =>
                              save.mutate(
                                { id: u.id, active: false },
                                { onSuccess: () => notice.show(`${u.name} ya no puede entrar.`), onSettled: () => setDeactivating(null) },
                              )
                            }
                          >
                            Sí, dar de baja
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeactivating(null)}>
                            No
                          </Button>
                        </span>
                      )}
                      {!self && deactivating !== u.id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            if (u.active) return setDeactivating(u.id);
                            save.mutate({ id: u.id, active: true }, { onSuccess: () => notice.show(`${u.name} vuelve a tener acceso.`) });
                          }}
                        >
                          {u.active ? "Dar de baja" : "Reactivar"}
                        </Button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <NewUserDialog open={creating} onClose={() => setCreating(false)} onDone={notice.show} />
      <PermissionsDialog user={permsOf} onClose={() => setPermsOf(null)} onDone={notice.show} />
      <PasswordDialog user={resetting} onClose={() => setResetting(null)} onDone={notice.show} />
      <Notice message={notice.message} />
    </>
  );
}

const EMPTY: UserCreate = { name: "", email: "", role: "miembro", password: "" };

function NewUserDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (body: UserCreate) => api.post<{ id: string }>("/api/users", body),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: KEY }), qc.invalidateQueries({ queryKey: taskKeys.team })]),
  });
  const form = useForm<UserCreate>({ resolver: zodResolver(userCreate), defaultValues: EMPTY });
  const [profile, setProfile] = useState<Exclude<Profile, "custom">>("editor");
  const err = form.formState.errors;
  const serverError = useServerErrors(form, create.error);

  useEffect(() => {
    if (!open) return;
    form.reset(EMPTY);
    setProfile("editor");
    create.reset();
  }, [open]);

  const onSubmit = form.handleSubmit(async (v) => {
    await create.mutateAsync(
      profile === "admin" ? { ...v, role: "admin" } : { ...v, role: "miembro", permissions: PRESETS[profile].permissions },
    );
    onDone(`Usuario ${v.name} creado. Pasale el email y la contraseña para que entre.`);
    onClose();
  });

  return (
    <Dialog open={open} onClose={onClose} title="Nuevo usuario" description="Entra con su email y la contraseña que le pongas acá.">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <Field label="Nombre" error={err.name?.message}>
          <Input autoFocus data-autofocus placeholder="Ej: Lucía Pérez" {...form.register("name")} />
        </Field>
        <Field label="Email" error={err.email?.message}>
          <Input type="email" autoComplete="off" placeholder="nombre@empresa.com" {...form.register("email")} />
        </Field>
        <Field label="Perfil" hint={`${PROFILE[profile].hint} Después podés ajustarlo sector por sector.`}>
          <Select value={profile} onChange={(e) => setProfile(e.target.value as Exclude<Profile, "custom">)}>
            {(["editor", "lectura", "admin"] as const).map((k) => (
              <option key={k} value={k}>
                {PROFILE[k].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Contraseña" error={err.password?.message} hint="Mínimo 8 caracteres.">
          <Input type="text" autoComplete="off" spellCheck={false} className="font-mono" {...form.register("password")} />
        </Field>
        {serverError && <p role="alert" className="rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>}
        <DialogActions className="flex justify-end gap-2 pt-1 max-sm:[&>:last-child]:flex-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={create.isPending}>
            Crear usuario
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function PasswordDialog({ user, onClose, onDone }: { user: UserDto | null; onClose: () => void; onDone: (m: string) => void }) {
  const save = useSaveUser();
  const [password, setPassword] = useState("");

  useEffect(() => {
    setPassword("");
    save.reset();
  }, [user?.id]);

  return (
    <Dialog
      open={!!user}
      onClose={onClose}
      title="Cambiar contraseña"
      description={user ? `${user.name} · se cierran sus sesiones y entra con la nueva.` : undefined}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!user) return;
          save.mutate({ id: user.id, password }, { onSuccess: () => (onDone(`Contraseña de ${user.name} cambiada.`), onClose()) });
        }}
      >
        <Field label="Nueva contraseña" hint="Mínimo 8 caracteres.">
          <Input
            autoFocus data-autofocus
            type="text"
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {save.error && <p role="alert" className="rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700">{save.error.message}</p>}
        <DialogActions className="flex justify-end gap-2 pt-1 max-sm:[&>:last-child]:flex-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={password.length < 8 || save.isPending}>
            Guardar contraseña
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/** Perfil del usuario y, si es a medida, el nivel en cada sector. */
function PermissionsDialog({ user, onClose, onDone }: { user: UserDto | null; onClose: () => void; onDone: (m: string) => void }) {
  const save = useSaveUser();
  const [admin, setAdmin] = useState(false);
  const [perms, setPerms] = useState<Permissions>(PRESETS.editor.permissions);

  useEffect(() => {
    if (!user) return;
    setAdmin(user.role === "admin");
    setPerms(user.role === "admin" ? PRESETS.editor.permissions : user.permissions);
    save.reset();
  }, [user?.id]);

  const profile: Profile = admin ? "admin" : (presetOf(perms) ?? "custom");
  const shown = admin ? FULL_ACCESS : perms;
  const pick = (p: Profile) => {
    setAdmin(p === "admin");
    if (p === "editor" || p === "lectura") setPerms(PRESETS[p].permissions);
  };

  return (
    <Dialog
      open={!!user}
      onClose={onClose}
      title="Permisos"
      description={user ? `${user.name} · ${user.email}` : undefined}
      className="max-w-2xl"
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!user) return;
          save.mutate(admin ? { id: user.id, role: "admin" } : { id: user.id, role: "miembro", permissions: perms }, {
            onSuccess: () => (onDone(`Permisos de ${user.name}: ${PROFILE[profile].label}.`), onClose()),
          });
        }}
      >
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-1.5 text-xs font-medium text-muted">Perfil</legend>
          {(["admin", "editor", "lectura", "custom"] as const).map((k) => (
            <label
              key={k}
              className={cn(
                "flex items-start gap-2.5 rounded-[10px] border px-3 py-2.5",
                profile === k ? "border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-100" : "border-line hover:bg-slate-50",
              )}
            >
              <input type="radio" name="perfil" className="mt-1" checked={profile === k} onChange={() => pick(k)} />
              <span>
                <strong className="block text-sm">{PROFILE[k].label}</strong>
                <span className="block text-xs text-muted">{PROFILE[k].hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">
            Nivel por sector{admin && " (un administrador tiene todo)"}
          </p>
          <ul className="divide-y divide-slate-100 rounded-[10px] border border-line">
            {AREAS.map((a: Area) => (
              <li key={a} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{AREA_INFO[a].label}</span>
                  {AREA_INFO[a].manage && <span className="block text-xs text-muted">Administrar: {AREA_INFO[a].manage}.</span>}
                </span>
                <Select
                  aria-label={`Nivel en ${AREA_INFO[a].label}`}
                  value={shown[a]}
                  disabled={admin}
                  onChange={(e) => setPerms({ ...perms, [a]: e.target.value as Level })}
                  className="h-8 w-44"
                >
                  {AREA_INFO[a].levels.map((l) => (
                    <option key={l} value={l}>
                      {LEVEL_LABEL[l]}
                    </option>
                  ))}
                </Select>
              </li>
            ))}
          </ul>
        </div>

        {save.error && <p role="alert" className="rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700">{save.error.message}</p>}
        <DialogActions className="flex justify-end gap-2 max-sm:[&>:last-child]:flex-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={save.isPending}>
            Guardar permisos
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
