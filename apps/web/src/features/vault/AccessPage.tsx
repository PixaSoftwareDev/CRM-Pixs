import { zodResolver } from "@hookform/resolvers/zod";
import { CREDENTIAL_KINDS, type CredentialDto, credentialCreate } from "@crm/shared";
import { Link } from "@tanstack/react-router";
import { Check, Copy, Download, Eye, EyeOff, ExternalLink, History, Lock, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PageHeader } from "../../components/layout/AppLayout";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Chip } from "../../components/ui/Chip";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select } from "../../components/ui/Field";
import { Notice, useNotice } from "../../components/ui/Notice";
import { Empty, ErrorBox, Skeleton } from "../../components/ui/States";
import { useDebounced } from "../../hooks/useDebounced";
import { useAccess } from "../../hooks/useAccess";
import { copyText } from "../../lib/clipboard";
import { downloadCsv } from "../../lib/csv";
import { ago, initials, plural, when } from "../../lib/format";
import { useClientOptions, useTeam } from "../tasks/api";
import { useServerErrors } from "../clients/useServerErrors";
import { useAccessLogs, useCreateCredential, useCredentials, useDeleteCredential, useReveal, useUpdateCredential } from "./api";
import { KIND } from "./labels";

/** Cuánto queda visible una clave antes de ocultarse sola. */
const VISIBLE_MS = 20_000;

export function AccessPage() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 250);
  const creds = useCredentials(dq.trim());
  const notice = useNotice();
  const [editing, setEditing] = useState<CredentialDto | "new" | null>(null);
  const [history, setHistory] = useState<{ clientId?: string } | null>(null);
  const isAdmin = useAccess().can("accesos", "manage");

  const groups = new Map<string, { client: CredentialDto["client"]; items: CredentialDto[] }>();
  for (const c of creds.data ?? []) {
    const g = groups.get(c.client.id) ?? { client: c.client, items: [] };
    g.items.push(c);
    groups.set(c.client.id, g);
  }

  return (
    <>
      <PageHeader
        title="Accesos"
        subtitle="Usuarios y contraseñas de cada cliente, guardados cifrados."
        actions={
          <>
            {isAdmin && (
              <Button variant="secondary" onClick={() => setHistory({})}>
                <History size={16} aria-hidden /> Historial de accesos
              </Button>
            )}
            <Button onClick={() => setEditing("new")}>
              <Plus size={16} aria-hidden /> Acceso
            </Button>
          </>
        }
      />
      <p className="flex gap-2 rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-950">
        <Lock size={16} aria-hidden className="mt-0.5 shrink-0" />
        Las claves nunca se muestran por defecto. Cada vez que alguien ve o copia una, queda registrado en el historial.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative w-full max-w-sm">
          <span className="sr-only">Buscar</span>
          <Search size={16} aria-hidden className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente o servicio…" className="pl-9" />
        </label>
        <span className="text-sm text-muted">
          {plural(groups.size, "cliente", "clientes")} · {plural(creds.data?.length ?? 0, "acceso", "accesos")}
        </span>
      </div>

      {creds.error ? (
        <ErrorBox error={creds.error} onRetry={() => void creds.refetch()} />
      ) : creds.isPending ? (
        <Skeleton className="h-64" />
      ) : groups.size === 0 ? (
        <Empty>{dq ? "Ningún acceso coincide con la búsqueda." : "Todavía no hay accesos guardados."}</Empty>
      ) : (
        [...groups.values()].map((g) => {
          const last = g.items.map((i) => i.lastUsedAt).filter((x): x is string => !!x).sort().at(-1);
          return (
            <Card key={g.client.id} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-indigo-50 text-xs font-bold text-indigo-800">
                    {initials(g.client.name)}
                  </span>
                  <div>
                    <Link to="/clientes/$clientId" params={{ clientId: g.client.id }} className="font-bold hover:underline">
                      {g.client.name}
                    </Link>
                    <p className="text-xs text-muted">
                      {plural(g.items.length, "acceso", "accesos")} · último uso {last ? ago(last) : "nunca"}
                    </p>
                  </div>
                </div>
                {isAdmin && (
                  <Button size="sm" variant="ghost" onClick={() => setHistory({ clientId: g.client.id })}>
                    Ver historial
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] table-fixed text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold tracking-wider text-muted uppercase">
                      <th className="w-[15%] px-4 py-2">Tipo</th>
                      <th className="w-[22%] px-4 py-2">Servicio</th>
                      <th className="w-[20%] px-4 py-2">Usuario</th>
                      <th className="w-[15%] px-4 py-2">Clave</th>
                      <th className="w-[28%] px-4 py-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {g.items.map((c) => (
                      <CredentialRow key={c.id} cred={c} onEdit={() => setEditing(c)} onNotice={notice.show} />
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })
      )}

      <CredentialDialog value={editing} onClose={() => setEditing(null)} onDone={notice.show} />
      <HistoryDialog filter={history} onClose={() => setHistory(null)} />
      <Notice message={notice.message} />
    </>
  );
}

function CredentialRow({ cred: c, onEdit, onNotice }: { cred: CredentialDto; onEdit: () => void; onNotice: (m: string) => void }) {
  const reveal = useReveal();
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // La clave se borra de la memoria sola a los pocos segundos y al salir de la pantalla.
  useEffect(() => () => clearTimeout(timer.current), []);
  const hideLater = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSecret(null), VISIBLE_MS);
  };

  const show = async () => {
    if (secret) return setSecret(null);
    const res = await reveal.mutateAsync({ id: c.id, action: "ver" });
    setSecret(res.secret);
    hideLater();
  };

  const copy = async () => {
    const res = await reveal.mutateAsync({ id: c.id, action: "copiar" });
    try {
      await copyText(res.secret);
    } catch {
      // Algunos navegadores no dejan copiar después de ir al servidor: queda a la vista para copiarla a mano.
      setSecret(res.secret);
      hideLater();
      onNotice(`No se pudo copiar sola: la clave de "${c.label}" quedó visible unos segundos para copiarla a mano.`);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    onNotice(`Clave de "${c.label}" copiada.`);
  };

  return (
    <tr>
      <td className="px-4 py-3">
        <Chip tone="slate">{KIND[c.kind]}</Chip>
      </td>
      <td className="px-4 py-3 font-medium">
        {c.label}
        {c.notes && <span className="block text-xs font-normal text-muted">{c.notes}</span>}
      </td>
      <td className="truncate px-4 py-3 font-mono text-xs">{c.username ?? "—"}</td>
      <td className="truncate px-4 py-3 font-mono text-xs">
        {secret ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-950">{secret}</span> : "••••••••••"}
      </td>
      <td className="px-4 py-3">
        <span className="flex justify-end gap-1">
          {c.connectUrl && (
            <a
              href={c.connectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1 rounded-[10px] px-2.5 text-xs font-semibold text-brand hover:bg-indigo-50"
            >
              <ExternalLink size={13} aria-hidden /> Conectar
            </a>
          )}
          <Button size="sm" variant="ghost" onClick={() => void show()} disabled={reveal.isPending} aria-label={secret ? "Ocultar clave" : `Ver la clave de ${c.label}`}>
            {secret ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />} {secret ? "Ocultar" : "Ver"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void copy()} disabled={reveal.isPending} aria-label={`Copiar la clave de ${c.label}`}>
            {copied ? <Check size={14} aria-hidden className="text-green-700" /> : <Copy size={14} aria-hidden />} Copiar
          </Button>
          <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Editar ${c.label}`}>
            <Pencil size={14} aria-hidden />
          </Button>
        </span>
        {reveal.error && <span className="block text-right text-xs text-red-700">{reveal.error.message}</span>}
      </td>
    </tr>
  );
}

// ─── Alta / edición ─────────────────────────────────────────────────────────

const formSchema = credentialCreate.extend({
  clientId: z.string().min(1, { message: "Elegí el cliente" }),
  // Al editar, vacío = no cambiar la clave.
  secret: z.string().max(2000),
});
type FormValues = z.input<typeof formSchema>;

function CredentialDialog({ value, onClose, onDone }: { value: CredentialDto | "new" | null; onClose: () => void; onDone: (m: string) => void }) {
  const clients = useClientOptions();
  const create = useCreateCredential();
  const update = useUpdateCredential();
  const del = useDeleteCredential();
  const editing = value && value !== "new" ? value : null;
  const mutation = editing ? update : create;
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema) });
  const serverError = useServerErrors(form, mutation.error ?? del.error);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isAdmin = useAccess().can("accesos", "manage");
  const err = form.formState.errors;

  useEffect(() => {
    if (!value) return;
    create.reset();
    update.reset();
    del.reset();
    setConfirmDelete(false);
    form.reset({
      clientId: editing?.client.id ?? "",
      kind: editing?.kind ?? "panel",
      label: editing?.label ?? "",
      username: editing?.username ?? "",
      secret: "",
      connectUrl: editing?.connectUrl ?? "",
      notes: editing?.notes ?? "",
    });
  }, [value]);

  const onSubmit = form.handleSubmit(async (v) => {
    const common = { kind: v.kind, label: v.label, username: v.username ?? "", connectUrl: v.connectUrl ?? "", notes: v.notes ?? "" };
    if (editing) {
      await update.mutateAsync({ id: editing.id, ...common, ...(v.secret && { secret: v.secret }) });
      onDone(`Acceso "${v.label}" actualizado.`);
    } else {
      if (!v.secret) return form.setError("secret", { message: "Falta la clave" });
      await create.mutateAsync({ clientId: v.clientId, ...common, secret: v.secret });
      onDone(`Acceso "${v.label}" guardado.`);
    }
    onClose();
  });

  return (
    <Dialog open={!!value} onClose={onClose} title={editing ? "Editar acceso" : "Nuevo acceso"} description="La clave se guarda cifrada.">
      <form onSubmit={onSubmit} noValidate autoComplete="off" className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cliente" error={err.clientId?.message}>
            <Select disabled={!!editing} {...form.register("clientId")}>
              <option value="">Elegí…</option>
              {editing && <option value={editing.client.id}>{editing.client.name}</option>}
              {clients.data
                ?.filter((c) => c.id !== editing?.client.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Tipo">
            <Select {...form.register("kind")}>
              {CREDENTIAL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Servicio" error={err.label?.message}>
            <Input placeholder="Ej: PC recepción, Panel del hosting" {...form.register("label")} />
          </Field>
          <Field label="Usuario">
            <Input autoComplete="off" {...form.register("username")} />
          </Field>
          <Field label={editing ? "Clave nueva (vacío = no cambiar)" : "Clave"} error={err.secret?.message}>
            <Input type="password" autoComplete="new-password" {...form.register("secret")} />
          </Field>
          <Field label="Link para conectar (opcional)" error={err.connectUrl?.message}>
            <Input placeholder="https://… o anydesk:123456789" {...form.register("connectUrl")} />
          </Field>
        </div>
        <Field label="Notas">
          <Input {...form.register("notes")} />
        </Field>
        {serverError && <p role="alert" className="rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {editing && isAdmin ? (
            confirmDelete ? (
              <span className="flex items-center gap-2 text-sm">
                ¿Borrar este acceso?
                <Button
                  size="sm"
                  variant="danger"
                  disabled={del.isPending}
                  onClick={() => del.mutate(editing.id, { onSuccess: () => (onDone(`Acceso "${editing.label}" borrado.`), onClose()) })}
                >
                  Sí, borrar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  No
                </Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={14} aria-hidden /> Borrar
              </Button>
            )
          ) : (
            <span />
          )}
          <span className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Guardar
            </Button>
          </span>
        </div>
      </form>
    </Dialog>
  );
}

// ─── Historial ──────────────────────────────────────────────────────────────

const ACTION_LABEL = { ver: "vio", copiar: "copió", crear: "creó", editar: "editó", eliminar: "borró" } as const;

function HistoryDialog({ filter, onClose }: { filter: { clientId?: string } | null; onClose: () => void }) {
  const clients = useClientOptions();
  const team = useTeam();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [clientId, setClientId] = useState("");
  const [userId, setUserId] = useState("");
  const dq = useDebounced(q, 250);

  useEffect(() => {
    if (filter) {
      setQ("");
      setFrom("");
      setTo("");
      setUserId("");
      setClientId(filter.clientId ?? "");
    }
  }, [filter]);

  const query = {
    ...(dq.trim() && { q: dq.trim() }),
    ...(from && { from }),
    ...(to && { to }),
    ...(clientId && { clientId }),
    ...(userId && { userId }),
  };
  const logs = useAccessLogs(query, !!filter);
  const rows = logs.data ?? [];

  return (
    <Dialog open={!!filter} onClose={onClose} title="Historial de accesos" description="Quién vio o copió cada clave, de más nuevo a más viejo." size="xl">
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-5">
          <Field label="Buscar">
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Acceso, cliente, usuario…" />
          </Field>
          <Field label="Desde">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Hasta">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="Cliente">
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Todos</option>
              {clients.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Usuario">
            <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Todos</option>
              {team.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {logs.error && <ErrorBox error={logs.error} />}
        <div className="max-h-[50vh] overflow-auto rounded-xl border border-line">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr className="text-left text-[11px] font-semibold tracking-wider text-muted uppercase">
                <th className="px-3 py-2">Fecha y hora</th>
                <th className="px-3 py-2">Usuario</th>
                <th className="px-3 py-2">Acción</th>
                <th className="px-3 py-2">Acceso</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2 tabular-nums">{when(l.at)}</td>
                  <td className="px-3 py-2">{l.user.name}</td>
                  <td className="px-3 py-2">
                    <Chip tone={l.action === "copiar" ? "amber" : l.action === "eliminar" ? "red" : "slate"}>{ACTION_LABEL[l.action]}</Chip>
                  </td>
                  <td className="px-3 py-2">{l.credentialLabel}</td>
                  <td className="px-3 py-2">{l.client.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted">{l.ipAddress ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!logs.isPending && rows.length === 0 && <p className="p-4 text-center text-sm text-muted">No hay movimientos con esos filtros.</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted">{plural(rows.length, "movimiento", "movimientos")}{rows.length >= 200 ? " (los 200 más nuevos)" : ""}</span>
          <Button
            size="sm"
            variant="secondary"
            disabled={rows.length === 0}
            onClick={() =>
              downloadCsv(
                "historial-accesos.csv",
                ["Fecha", "Usuario", "Acción", "Acceso", "Cliente", "IP"],
                rows.map((l) => [new Date(l.at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }), l.user.name, ACTION_LABEL[l.action], l.credentialLabel, l.client.name, l.ipAddress]),
              )
            }
          >
            <Download size={14} aria-hidden /> Exportar CSV
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
