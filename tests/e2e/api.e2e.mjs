#!/usr/bin/env node
/**
 * Prueba de punta a punta de la API: recorre todas las funciones como un
 * usuario real (login → clientes → tareas → embudo → proyectos → tickets →
 * finanzas → accesos → automatizaciones → logout) y verifica cada respuesta.
 *
 * CREA DATOS: correrlo solo contra una base de prueba (local o un stack
 * temporal), nunca contra la base de producción con datos reales.
 *
 *   E2E_BASE=http://localhost:3001 E2E_ORIGIN=http://localhost:5173 \
 *   E2E_EMAIL=… E2E_PASSWORD=… node tests/e2e/api.e2e.mjs
 *
 * E2E_BASE es donde vive /api (en el VPS: http://IP/crmpixs). Sale con código 1 si algo falla.
 */
const BASE = process.env.E2E_BASE?.replace(/\/$/, "");
const ORIGIN = process.env.E2E_ORIGIN ?? BASE;
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
if (!BASE || !EMAIL || !PASSWORD) {
  console.error("Faltan E2E_BASE, E2E_EMAIL o E2E_PASSWORD");
  process.exit(2);
}

// ─── Mini cliente HTTP con cookies ───────────────────────────────────────────
const jar = new Map();
async function http(method, path, body, { auth = true } = {}) {
  const headers = { Origin: ORIGIN };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    const k = pair.slice(0, i);
    const v = pair.slice(i + 1);
    if (/max-age=0/i.test(c) || v === "") jar.delete(k);
    else jar.set(k, v);
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}
const get = (p, o) => http("GET", p, undefined, o);
const post = (p, b, o) => http("POST", p, b, o);
const patch = (p, b) => http("PATCH", p, b);
const put = (p, b) => http("PUT", p, b);
const del = (p) => http("DELETE", p);

// ─── Asserts ─────────────────────────────────────────────────────────────────
let passed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) passed++;
  else failures.push(`${name}${detail === undefined ? "" : ` → ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 300)}`}`);
}
function expectStatus(name, res, ...codes) {
  check(`${name} (HTTP ${codes.join("/")})`, codes.includes(res.status), `${res.status} ${JSON.stringify(res.data).slice(0, 200)}`);
  return codes.includes(res.status);
}
async function section(title, fn) {
  const before = failures.length;
  try {
    await fn();
  } catch (err) {
    failures.push(`${title}: excepción ${err?.stack ?? err}`);
  }
  console.log(`${failures.length === before ? "✓" : "✗"} ${title}`);
}

// ─── Fechas en hora argentina ────────────────────────────────────────────────
const arDay = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(d);
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const at = (date, hhmm) => `${date}T${hhmm}:00-03:00`;
const TODAY = arDay();
const RUN = Date.now().toString(36);

/** CUIT con dígito verificador válido a partir de 10 dígitos. */
function cuit(base10) {
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = [...base10].reduce((a, d, i) => a + Number(d) * (w[i] ?? 0), 0);
  let dv = 11 - (sum % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) return null;
  return base10 + dv;
}
function freshCuit() {
  for (;;) {
    const base = `30${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
    const c = cuit(base);
    if (c) return c;
  }
}

// ─── Recorrido ───────────────────────────────────────────────────────────────
const ctx = {};

await section("Salud y seguridad básica", async () => {
  expectStatus("health", await get("/api/health"), 200);
  expectStatus("ready (base conectada)", await get("/api/ready"), 200);
  expectStatus("sin sesión no deja ver clientes", await get("/api/clients", { auth: false }), 401);
  expectStatus("sin sesión no deja ver accesos", await get("/api/credentials", { auth: false }), 401);
  expectStatus("registro público deshabilitado", await post("/api/auth/sign-up/email", { email: `x${RUN}@x.com`, password: "algo-largo-123456", name: "x" }, { auth: false }), 400, 401, 403, 404, 422);
});

await section("Login", async () => {
  const bad = await post("/api/auth/sign-in/email", { email: EMAIL, password: `${PASSWORD}-mala` }, { auth: false });
  expectStatus("contraseña incorrecta rechazada", bad, 401);
  const ok = await post("/api/auth/sign-in/email", { email: EMAIL, password: PASSWORD });
  expectStatus("login correcto", ok, 200);
  const cookie = ok.headers.getSetCookie().find((c) => c.includes("session_token="));
  check("cookie de sesión httpOnly", !!cookie && /httponly/i.test(cookie), cookie);
  check("cookie de sesión dura 30 días", !!cookie && /max-age=2592000/i.test(cookie), cookie);
  const me = await get("/api/me");
  expectStatus("/api/me", me, 200);
  check("/api/me es el usuario logueado", me.data?.email === EMAIL.toLowerCase(), me.data);
  ctx.me = me.data;
});

await section("Catálogos y equipo", async () => {
  const team = await get("/api/team");
  expectStatus("equipo", team, 200);
  check("el equipo incluye al usuario", team.data?.some((u) => u.id === ctx.me.id));
  const types = await get("/api/task-types");
  expectStatus("tipos de tarea", types, 200);
  for (const n of ["Reunión", "Llamada", "Ventas", "Cobranza", "Implementación", "Falla"]) {
    check(`tipo de tarea "${n}" sembrado`, types.data?.some((t) => t.name === n));
  }
  ctx.type = Object.fromEntries((types.data ?? []).map((t) => [t.name, t.id]));
  const pipe = await get("/api/pipeline");
  expectStatus("embudo", pipe, 200);
  check("embudo con 7 etapas", pipe.data?.stages?.length === 7, pipe.data?.stages?.length);
  ctx.stage = Object.fromEntries((pipe.data?.stages ?? []).map((s) => [s.key, s.id]));
  const rules = await get("/api/automations");
  expectStatus("automatizaciones", rules, 200);
  check("10 reglas sembradas", rules.data?.length === 10, rules.data?.length);
});

await section("Clientes y Cliente 360", async () => {
  const taxId = freshCuit();
  const bad = await post("/api/clients", { name: "X", taxId: "20123456780" });
  expectStatus("CUIT inválido rechazado", bad, 400);
  const c = await post("/api/clients", { name: `E2E Cliente ${RUN}`, taxId, email: "E2E@Cliente.com", phone: "+54 11 5555-0000", status: "activo" });
  expectStatus("crear cliente", c, 201);
  ctx.clientId = c.data?.id;
  expectStatus("CUIT duplicado → 409", await post("/api/clients", { name: "Otro", taxId }), 409);
  const list = await get(`/api/clients?q=${encodeURIComponent(`E2E Cliente ${RUN}`)}`);
  expectStatus("buscar cliente", list, 200);
  check("la búsqueda lo encuentra", list.data?.items?.some((x) => x.id === ctx.clientId));
  expectStatus("resumen de clientes", await get("/api/clients/summary"), 200);
  const opts = await get("/api/clients/options");
  check("aparece en las opciones de selectores", opts.data?.some((x) => x.id === ctx.clientId));
  const detail = await get(`/api/clients/${ctx.clientId}`);
  expectStatus("Cliente 360", detail, 200);
  check("email guardado en minúsculas", detail.data?.email === "e2e@cliente.com", detail.data?.email);
  expectStatus("editar cliente", await patch(`/api/clients/${ctx.clientId}`, { priority: "media", address: "Calle 123" }), 204);
  expectStatus("estado sin motivo → 400", await post(`/api/clients/${ctx.clientId}/status`, { status: "en_riesgo" }), 400);
  expectStatus("estado con motivo", await post(`/api/clients/${ctx.clientId}/status`, { status: "en_riesgo", reason: "Prueba" }), 204);
  expectStatus("volver a activo", await post(`/api/clients/${ctx.clientId}/status`, { status: "activo" }), 204);
  const ct = await post(`/api/clients/${ctx.clientId}/contacts`, { name: "Contacto E2E", phone: "1111", email: "c@e2e.com", isDecisionMaker: true });
  expectStatus("crear contacto", ct, 201, 200);
  const contactId = ct.data?.id;
  if (contactId) {
    expectStatus("editar contacto", await patch(`/api/clients/${ctx.clientId}/contacts/${contactId}`, { jobTitle: "Dueño" }), 204, 200);
    const extra = await post(`/api/clients/${ctx.clientId}/contacts`, { name: "Para borrar" });
    expectStatus("borrar contacto", await del(`/api/clients/${ctx.clientId}/contacts/${extra.data?.id}`), 204);
    expectStatus("borrarlo de nuevo → 404", await del(`/api/clients/${ctx.clientId}/contacts/${extra.data?.id}`), 404);
  }
  expectStatus("perfil de facturación", await put(`/api/clients/${ctx.clientId}/billing`, { invoiceLetter: "B", paymentTermDays: 10 }), 204, 200);
  expectStatus("nota en la actividad", await post(`/api/clients/${ctx.clientId}/activities`, { kind: "nota", body: "Nota E2E" }), 201, 200);
  const acts = await get(`/api/clients/${ctx.clientId}/activities`);
  check("la actividad registra cambios y notas", (acts.data?.items?.length ?? 0) >= 3, acts.data?.items?.length);
  expectStatus("cliente inexistente → 404", await get("/api/clients/01890000-0000-7000-8000-000000000000"), 404);
});

await section("Mi día / Agenda / tareas", async () => {
  const t = await post("/api/tasks", { title: `Tarea E2E ${RUN}`, typeId: ctx.type["Llamada"], clientId: ctx.clientId, startsAt: at(TODAY, "10:00"), durationMinutes: 30 });
  expectStatus("crear tarea", t, 201);
  ctx.taskId = t.data?.id;
  expectStatus("título vacío → 400", await post("/api/tasks", { title: "", typeId: ctx.type["Llamada"] }), 400);
  const day = await get(`/api/tasks?from=${TODAY}&to=${TODAY}`);
  expectStatus("tareas del día", day, 200);
  check("la tarea aparece en el día", day.data?.some((x) => x.id === ctx.taskId));
  expectStatus("rango de más de 42 días → 400", await get(`/api/tasks?from=${TODAY}&to=${addDays(TODAY, 60)}`), 400);
  expectStatus("reprogramar y comentar", await patch(`/api/tasks/${ctx.taskId}`, { startsAt: at(TODAY, "11:00"), durationMinutes: 45, comment: "Comentario E2E" }), 204);
  expectStatus("comentario suelto", await post(`/api/tasks/${ctx.taskId}/comments`, { body: "Otro comentario" }), 201);
  expectStatus("en curso", await patch(`/api/tasks/${ctx.taskId}`, { status: "en_curso" }), 204);
  const d = await get(`/api/tasks/${ctx.taskId}`);
  expectStatus("detalle de tarea", d, 200);
  check("quedan los comentarios automáticos", (d.data?.comments?.length ?? 0) >= 4, d.data?.comments?.map((c) => c.body));
  check("la duración se guardó", d.data?.durationMinutes === 45, d.data?.durationMinutes);
  const tt = await post("/api/task-types", { name: `Tipo E2E ${RUN}`, color: "#123456" });
  expectStatus("crear tipo de tarea", tt, 201);
  expectStatus("tipo repetido → 409", await post("/api/task-types", { name: `Tipo E2E ${RUN}`, color: "#123456" }), 409);
  expectStatus("borrar tipo nuevo", await del(`/api/task-types/${tt.data?.id}`), 204);
  expectStatus("borrar tipo de sistema → 409", await del(`/api/task-types/${ctx.type["Reunión"]}`), 409);
  const ct = await get(`/api/clients/${ctx.clientId}/tasks`);
  check("la tarea aparece en el Cliente 360", ct.data?.some((x) => x.id === ctx.taskId));
});

await section("Embudo: potencial → reglas automáticas → ganada / perdida", async () => {
  const opp = await post("/api/opportunities", { title: "Web E2E", amount: 50000000, newClient: { name: `Potencial E2E ${RUN}`, contactName: "Ana", phone: "1234" }, firstCallAt: at(TODAY, "12:00") });
  expectStatus("nuevo potencial", opp, 201);
  ctx.oppId = opp.data?.id;
  ctx.oppClientId = opp.data?.clientId;
  expectStatus("sin cliente → 400", await post("/api/opportunities", { title: "X" }), 400);
  const stageOf = async () => {
    const p = await get("/api/pipeline");
    for (const s of p.data?.stages ?? []) {
      const ops = await get(`/api/pipeline/stages/${s.id}/opportunities`);
      if (ops.data?.some((o) => o.id === ctx.oppId)) return s.key;
    }
    return null;
  };
  check("arranca en Potencial", (await stageOf()) === "potencial");
  // La llamada de primer contacto que se agendó sola: al finalizarla avanza.
  const tasks = await get(`/api/clients/${ctx.oppClientId}/tasks`);
  const call = tasks.data?.find((t) => t.typeName === "Llamada");
  check("se agendó la llamada de primer contacto", !!call);
  if (call) expectStatus("finalizar la llamada", await patch(`/api/tasks/${call.id}`, { status: "hecha" }), 204);
  check("regla: llamada hecha → Primer contacto", (await stageOf()) === "primer_contacto");
  expectStatus("agendar reunión", await post("/api/tasks", { title: "Reunión E2E", typeId: ctx.type["Reunión"], clientId: ctx.oppClientId, startsAt: at(addDays(TODAY, 1), "10:00") }), 201);
  check("regla: reunión agendada → Reunión", (await stageOf()) === "reunion");
  expectStatus("pasar a implementación a mano → 400", await post(`/api/opportunities/${ctx.oppId}/move`, { stageId: ctx.stage.implementacion }), 400);
  expectStatus("mover a mano a Cierre", await post(`/api/opportunities/${ctx.oppId}/move`, { stageId: ctx.stage.cierre }), 204);
  const win = await post(`/api/opportunities/${ctx.oppId}/win`, { implementerId: ctx.me.id, projectName: `Proyecto E2E ${RUN}`, paymentTerms: "50% + 2 cuotas", startsOn: TODAY, dueOn: addDays(TODAY, 60), estimatedHours: 1, kickoffAt: at(addDays(TODAY, 1), "15:00") });
  expectStatus("venta ganada", win, 200);
  ctx.projectId = win.data?.projectId;
  expectStatus("ganarla de nuevo → 409", await post(`/api/opportunities/${ctx.oppId}/win`, { implementerId: ctx.me.id, projectName: "x", paymentTerms: "x", startsOn: TODAY, kickoffAt: at(TODAY, "10:00") }), 409);
  const cl = await get(`/api/clients/${ctx.oppClientId}`);
  check("el cliente pasó a Activo", cl.data?.status === "activo", cl.data?.status);
  const lost = await post("/api/opportunities", { title: "Para perder", amount: 0, clientId: ctx.clientId });
  expectStatus("perdida sin motivo → 400", await post(`/api/opportunities/${lost.data?.id}/lose`, { reason: "" }), 400);
  expectStatus("marcar perdida", await post(`/api/opportunities/${lost.data?.id}/lose`, { reason: "Precio" }), 204);
  // "Comentar" que aceptó y después "Finalizar" (sin texto en la caja) también cierra la venta.
  const o2 = await post("/api/opportunities", { title: "Acepta E2E", amount: 0, newClient: { name: `Acepta E2E ${RUN}`, contactName: "Bea", phone: "5678" } });
  expectStatus("otro potencial", o2, 201);
  const sale = await post("/api/tasks", { title: "Propuesta E2E", typeId: ctx.type["Ventas"], clientId: o2.data?.clientId, startsAt: at(TODAY, "11:00") });
  expectStatus("tarea de ventas", sale, 201);
  expectStatus("comentar que aceptó", await post(`/api/tasks/${sale.data?.id}/comments`, { body: "El cliente aceptó la propuesta" }), 201);
  expectStatus("finalizar sin comentario", await patch(`/api/tasks/${sale.data?.id}`, { status: "hecha" }), 204);
  const pipe = await get("/api/pipeline");
  const cierre = pipe.data?.stages?.find((x) => x.key === "cierre");
  const inCierre = await get(`/api/pipeline/stages/${cierre?.id}/opportunities`);
  check("regla: el comentario ya guardado cuenta → Cierre", inCierre.data?.some((o) => o.id === o2.data?.id));
  await post(`/api/opportunities/${o2.data?.id}/lose`, { reason: "Prueba E2E" });
});

await section("Proyectos", async () => {
  const p = await get(`/api/projects/${ctx.projectId}`);
  expectStatus("detalle del proyecto creado por la venta", p, 200);
  check("tiene la foto de la venta", p.data?.sale?.amount === 50000000 && p.data?.sale?.paymentTerms === "50% + 2 cuotas", p.data?.sale);
  check("creado automáticamente", p.data?.createdAutomatically === true);
  check("kickoff agendado al implementador", p.data?.tasks?.some((t) => /kickoff/i.test(t.title)), p.data?.tasks?.map((t) => t.title));
  expectStatus("pasar a Relevamiento", await patch(`/api/projects/${ctx.projectId}`, { phase: "relevamiento" }), 204);
  const p2 = await get(`/api/projects/${ctx.projectId}`);
  check("avance 20% y en curso", p2.data?.progress === 20 && p2.data?.status === "en_curso", { progress: p2.data?.progress, status: p2.data?.status });
  expectStatus("fechas invertidas → 400", await patch(`/api/projects/${ctx.projectId}`, { startsOn: addDays(TODAY, 90) }), 400);
  const manual = await post("/api/projects", { name: `Manual E2E ${RUN}`, clientId: ctx.clientId, saleAmount: 10000000 });
  expectStatus("proyecto manual", manual, 201);
  ctx.manualProjectId = manual.data?.id;
  const list = await get("/api/projects");
  check("aparecen en el listado", list.data?.some((x) => x.id === ctx.projectId) && list.data?.some((x) => x.id === ctx.manualProjectId));
  expectStatus("dar de baja el proyecto manual", await patch(`/api/projects/${ctx.manualProjectId}`, { archived: true }), 204);
  const active = await get("/api/projects");
  check("dado de baja: sale del listado", !active.data?.some((x) => x.id === ctx.manualProjectId));
  const archived = await get("/api/projects?archived=1");
  check("dado de baja: aparece en Ver dados de baja", archived.data?.some((x) => x.id === ctx.manualProjectId) && !archived.data?.some((x) => x.id === ctx.projectId));
  const pa = await get(`/api/projects/${ctx.manualProjectId}`);
  check("dado de baja: el detalle sigue accesible", pa.status === 200 && !!pa.data?.archivedAt, pa.data?.archivedAt);
  expectStatus("reactivar el proyecto", await patch(`/api/projects/${ctx.manualProjectId}`, { archived: false }), 204);
  const back = await get("/api/projects");
  check("reactivado: vuelve al listado", back.data?.some((x) => x.id === ctx.manualProjectId && x.archivedAt === null));
});

await section("Tickets: flujo completo", async () => {
  const t = await post("/api/tickets", { clientId: ctx.oppClientId, projectId: ctx.projectId, type: "falla", channel: "whatsapp", priority: "alta", title: `Ticket E2E ${RUN}`, description: "No anda", dueOn: addDays(TODAY, 2) });
  expectStatus("cargar ticket", t, 201);
  ctx.ticketId = t.data?.id;
  expectStatus("proyecto de otro cliente → 400", await post("/api/tickets", { clientId: ctx.clientId, projectId: ctx.projectId, type: "falla", channel: "email", title: "x" }), 400);
  expectStatus("terminar antes de asignar → 409", await post(`/api/tickets/${ctx.ticketId}/work-done`, { confirmerId: ctx.me.id, confirmAt: at(TODAY, "18:00") }), 409);
  expectStatus("asignar y agendar", await post(`/api/tickets/${ctx.ticketId}/assign`, { assigneeId: ctx.me.id, scheduledAt: at(TODAY, "16:00") }), 204);
  expectStatus("trabajo terminado (con horas)", await post(`/api/tickets/${ctx.ticketId}/work-done`, { confirmerId: ctx.me.id, confirmAt: at(TODAY, "18:00"), minutes: 90, note: "Listo" }), 204);
  expectStatus("no quedó bien sin fecha → 400", await post(`/api/tickets/${ctx.ticketId}/confirm`, { ok: false }), 400);
  expectStatus("no quedó bien → vuelve al técnico", await post(`/api/tickets/${ctx.ticketId}/confirm`, { ok: false, note: "Sigue", retryAt: at(addDays(TODAY, 1), "09:00") }), 204);
  // Regla: el técnico finaliza su tarea en Mi día → el ticket pasa a confirmar solo.
  const d1 = await get(`/api/tickets/${ctx.ticketId}`);
  check("volvió a En trabajo", d1.data?.status === "en_curso", d1.data?.status);
  const work = d1.data?.tasks?.find((x) => x.status !== "hecha" && x.type.name !== "Llamada");
  if (work) expectStatus("el técnico finaliza su tarea", await patch(`/api/tasks/${work.id}`, { status: "hecha" }), 204);
  const d2 = await get(`/api/tickets/${ctx.ticketId}`);
  check("regla: pasó solo a A confirmar", d2.data?.status === "a_confirmar", d2.data?.status);
  expectStatus("nota en el historial", await post(`/api/tickets/${ctx.ticketId}/notes`, { body: "Nota E2E" }), 204);
  expectStatus("confirmó que quedó bien", await post(`/api/tickets/${ctx.ticketId}/confirm`, { ok: true, note: "Ya anda" }), 204);
  const d3 = await get(`/api/tickets/${ctx.ticketId}`);
  check("ticket resuelto", d3.data?.status === "resuelto" && !!d3.data?.resolvedAt, d3.data?.status);
  check("historial completo", (d3.data?.events?.length ?? 0) >= 7, d3.data?.events?.length);
  check("sin tareas abiertas", d3.data?.tasks?.every((x) => x.status === "hecha"), d3.data?.tasks?.map((x) => x.status));
  const list = await get(`/api/tickets?q=${encodeURIComponent(`Ticket E2E ${RUN}`)}&status=resuelto`);
  check("el buscador lo encuentra filtrando", list.data?.items?.some((x) => x.id === ctx.ticketId));
  const c = await post("/api/tickets", { clientId: ctx.clientId, type: "consulta", channel: "email", title: "Para cancelar", assignTo: { assigneeId: ctx.me.id, scheduledAt: at(TODAY, "17:00") } });
  expectStatus("cargar ya asignado", c, 201);
  expectStatus("cancelar sin motivo → 400", await post(`/api/tickets/${c.data?.id}/cancel`, { reason: "" }), 400);
  expectStatus("cancelar", await post(`/api/tickets/${c.data?.id}/cancel`, { reason: "Duplicado" }), 204);
  expectStatus("dar de baja el ticket", await patch(`/api/tickets/${c.data?.id}`, { archived: true }), 204);
  const live = await get("/api/tickets?q=Para%20cancelar");
  check("dado de baja: sale del buscador", !live.data?.items?.some((x) => x.id === c.data?.id));
  const gone = await get("/api/tickets?q=Para%20cancelar&archived=1");
  check("dado de baja: aparece en Ver dados de baja", gone.data?.items?.some((x) => x.id === c.data?.id && !!x.archivedAt));
  expectStatus("reactivar el ticket", await patch(`/api/tickets/${c.data?.id}`, { archived: false }), 204);
  const pr = await get(`/api/projects/${ctx.projectId}`);
  // 1,5 h del primer "trabajo terminado" + 1 h de la tarea de retrabajo finalizada en Mi día (su duración).
  check("las horas del ticket se sumaron al proyecto", pr.data?.hoursUsed === 2.5, pr.data?.hoursUsed);
});

await section("Tickets: varias tareas a varias personas", async () => {
  const team = (await get("/api/team")).data ?? [];
  const others = team.filter((u) => u.id !== ctx.me.id).slice(0, 2);
  check("hay al menos 3 personas en el equipo", others.length === 2, team.length);
  const [p2, p3] = others;
  const t = await post("/api/tickets", { clientId: ctx.oppClientId, projectId: ctx.projectId, type: "implementacion", channel: "presencial", title: `Reunión de diseño E2E ${RUN}` });
  expectStatus("cargar ticket", t, 201);
  const id = t.data?.id;
  const path = `/api/tickets/${id}`;
  const task = (who, hhmm, title = "Reu de diseño", typeId = ctx.type["Reunión"]) => ({ title, typeId, assigneeId: who, startsAt: at(addDays(TODAY, 1), hhmm), durationMinutes: 60 });

  expectStatus("tarea sin título → 400", await post(`${path}/tasks`, { ...task(ctx.me.id, "09:00"), title: " " }), 400);
  expectStatus("la primera tarea de un ticket nuevo lo asigna", await post(`${path}/tasks`, task(ctx.me.id, "09:00", "Preparar la reu")), 201);
  let d = (await get(path)).data;
  check("quedó en curso a mi nombre", d?.status === "en_curso" && d?.assignee?.id === ctx.me.id, d?.status);
  check("es la tarea principal", d?.tasks?.[0]?.ticketRole === "principal", d?.tasks?.[0]?.ticketRole);
  expectStatus("tarea para otra persona", await post(`${path}/tasks`, task(p2.id, "10:00")), 201);
  expectStatus("tarea para una tercera persona", await post(`${path}/tasks`, task(p3.id, "10:00")), 201);
  d = (await get(path)).data;
  check("3 tareas abiertas, a 3 personas", new Set(d?.tasks?.filter((x) => x.status === "pendiente").map((x) => x.assignee.id)).size === 3, d?.tasks?.length);
  check("2 adicionales", d?.tasks?.filter((x) => x.ticketRole === "adicional").length === 2);
  check("heredan el cliente del ticket", d?.tasks?.every((x) => x.client?.id === ctx.oppClientId));
  const agenda = (await get(`/api/tasks?from=${addDays(TODAY, 1)}&to=${addDays(TODAY, 1)}`)).data ?? [];
  const agendaIds = new Set(agenda.map((x) => x.id));
  check("las 3 están en la agenda", d?.tasks?.every((x) => agendaIds.has(x.id)));

  // Doble clic en "Asignar y agendar": la misma asignación dos veces seguidas no reasigna.
  const same = { assigneeId: ctx.me.id, scheduledAt: at(addDays(TODAY, 1), "09:00"), durationMinutes: 60 };
  const principal = d?.tasks?.find((x) => x.ticketRole === "principal");
  const [r1, r2] = await Promise.all([post(`${path}/assign`, same), post(`${path}/assign`, same)]);
  check("asignación idéntica repetida → 204 las dos", r1.status === 204 && r2.status === 204, [r1.status, r2.status]);
  d = (await get(path)).data;
  check("no se canceló ni duplicó la principal", d?.tasks?.filter((x) => x.ticketRole === "principal" && x.status !== "cancelada").length === 1 && d?.tasks?.some((x) => x.id === principal?.id && x.status === "pendiente"), d?.tasks?.map((x) => [x.ticketRole, x.status]));

  // Reasignar cambia solo la principal: las de los demás siguen.
  expectStatus("reasignar el ticket a otra persona", await post(`${path}/assign`, { assigneeId: p2.id, scheduledAt: at(addDays(TODAY, 1), "11:00") }), 204);
  d = (await get(path)).data;
  check("la principal anterior se canceló", d?.tasks?.some((x) => x.id === principal?.id && x.status === "cancelada"));
  check("las adicionales siguen abiertas", d?.tasks?.filter((x) => x.ticketRole === "adicional" && x.status === "pendiente").length === 2);

  // Un tipo con "Llamada" en el nombre no confunde al flujo (el papel no depende del tipo).
  const open = d?.tasks?.filter((x) => x.status === "pendiente" && x.ticketRole !== "confirmacion") ?? [];
  expectStatus("cambiar el tipo de una adicional a Llamada", await patch(`/api/tasks/${open.find((x) => x.ticketRole === "adicional")?.id}`, { typeId: ctx.type["Llamada"], title: "Reu de diseño (corregido)" }), 204);
  const edited = (await get(`/api/tasks/${open.find((x) => x.ticketRole === "adicional")?.id}`)).data;
  check("título y tipo editados", edited?.title === "Reu de diseño (corregido)" && edited?.type?.name === "Llamada", edited);

  for (const [i, x] of open.entries()) {
    expectStatus(`finalizar tarea ${i + 1} de ${open.length}`, await patch(`/api/tasks/${x.id}`, { status: "hecha" }), 204);
    d = (await get(path)).data;
    const last = i === open.length - 1;
    check(last ? "con la última pasa a confirmar" : `con ${i + 1} hecha(s) sigue en curso`, d?.status === (last ? "a_confirmar" : "en_curso"), d?.status);
  }
  check("se agendó una sola llamada de confirmación", d?.tasks?.filter((x) => x.ticketRole === "confirmacion").length === 1);
  expectStatus("con el ticket a confirmar no se agregan tareas → 409", await post(`${path}/tasks`, task(p3.id, "12:00")), 409);
  expectStatus("cancelar el ticket", await post(`${path}/cancel`, { reason: "Prueba" }), 204);

  // Cancelar tareas desde Mi día: si ya se hizo parte del trabajo pasa a confirmar; si no, vuelve a Nuevo.
  for (const doneFirst of [true, false]) {
    const t2 = await post("/api/tickets", { clientId: ctx.oppClientId, type: "consulta", channel: "email", title: `Cancelar tareas E2E ${RUN} ${doneFirst}` });
    const p2path = `/api/tickets/${t2.data?.id}`;
    await post(`${p2path}/tasks`, task(ctx.me.id, "13:00", "Parte 1"));
    await post(`${p2path}/tasks`, task(p2.id, "14:00", "Parte 2"));
    const [a, b] = (await get(p2path)).data?.tasks ?? [];
    await patch(`/api/tasks/${a?.id}`, { status: doneFirst ? "hecha" : "cancelada" });
    expectStatus("cancelar la otra tarea", await patch(`/api/tasks/${b?.id}`, { status: "cancelada" }), 204);
    const st = (await get(p2path)).data?.status;
    check(doneFirst ? "una hecha y la otra cancelada → a confirmar" : "todas canceladas → vuelve a Nuevo", st === (doneFirst ? "a_confirmar" : "nuevo"), st);
    await post(`${p2path}/cancel`, { reason: "Prueba" });
  }
});

await section("Finanzas", async () => {
  const inv = await post(`/api/clients/${ctx.clientId}/invoices`, { concept: "Factura E2E", amount: 10000000, issuedOn: TODAY });
  expectStatus("emitir factura", inv, 201);
  expectStatus("importe 0 → 400", await post(`/api/clients/${ctx.clientId}/invoices`, { concept: "x", amount: 0, issuedOn: TODAY }), 400);
  const pay = await post(`/api/clients/${ctx.clientId}/payments`, { amount: 4000000, method: "transferencia", receivedOn: TODAY });
  expectStatus("cobro parcial", pay, 201);
  check("se imputó a la factura", pay.data?.allocated === 4000000 && pay.data?.credit === 0, pay.data);
  const st = await get(`/api/clients/${ctx.clientId}/statement`);
  expectStatus("estado de cuenta", st, 200);
  check("saldo = 100.000 − 40.000", st.data?.closingBalance === 6000000, st.data?.closingBalance);
  const over = await post(`/api/clients/${ctx.clientId}/payments`, { amount: 8000000, method: "efectivo", receivedOn: TODAY });
  check("lo que sobra queda a favor", over.data?.credit === 2000000, over.data);
  const plan = await post(`/api/projects/${ctx.projectId}/installment-plans`, { description: "Plan E2E", items: [{ number: 0, amount: 25000000, dueOn: TODAY }, { number: 1, amount: 12500000, dueOn: addDays(TODAY, 30) }, { number: 2, amount: 12500000, dueOn: addDays(TODAY, 60) }] });
  expectStatus("plan de cuotas", plan, 201);
  expectStatus("cuotas repetidas → 400", await post(`/api/projects/${ctx.projectId}/installment-plans`, { description: "x", items: [{ number: 1, amount: 1, dueOn: TODAY }, { number: 1, amount: 1, dueOn: TODAY }] }), 400);
  const plans = await get(`/api/projects/${ctx.projectId}/installment-plans`);
  const advance = plans.data?.[0]?.installments?.find((i) => i.number === 0);
  check("anticipo sin facturar", advance?.status === "pendiente", advance);
  const rec = await get("/api/finance/receivables");
  check("la cuota aparece en Por cobrar", rec.data?.some((r) => r.kind === "installment" && r.id === advance?.id));
  expectStatus("apagar recordatorio de la cuota", await patch(`/api/installments/${advance?.id}`, { autoReminder: false }), 204);
  expectStatus("cobrar cuota sin facturar", await post(`/api/installments/${advance?.id}/pay`, { method: "transferencia", receivedOn: TODAY }), 201);
  expectStatus("cobrarla de nuevo → 409", await post(`/api/installments/${advance?.id}/pay`, { method: "transferencia", receivedOn: TODAY }), 409);
  const plans2 = await get(`/api/projects/${ctx.projectId}/installment-plans`);
  check("la cuota quedó cobrada", plans2.data?.[0]?.installments?.find((i) => i.number === 0)?.status === "cobrada");
  const sub = await post("/api/subscriptions", { clientId: ctx.clientId, name: `Abono E2E ${RUN}`, amount: 4500000, billingDay: 1, startsOn: addDays(TODAY, -40) });
  expectStatus("crear abono", sub, 201);
  const month = TODAY.slice(0, 7);
  const acc1 = await post("/api/accruals", { month });
  expectStatus("devengar el mes", acc1, 200);
  check("generó la factura del abono", acc1.data?.created?.some((c) => c.concept.includes(`Abono E2E ${RUN}`)), acc1.data);
  const acc2 = await post("/api/accruals", { month });
  check("devengar de nuevo no duplica", !acc2.data?.created?.some((c) => c.concept.includes(`Abono E2E ${RUN}`)), acc2.data);
  expectStatus("aumento IPC", await post("/api/price-adjustments", { percent: 2.7, effectiveOn: TODAY, subscriptionIds: [sub.data?.id] }), 201);
  const subs = await get("/api/subscriptions");
  const s = subs.data?.find((x) => x.id === sub.data?.id);
  check("IPC 2,7%: $45.000 → $46.215", s?.amount === 4621500 && s?.previousAmount === 4500000, s);
  expectStatus("dar de baja el abono", await patch(`/api/subscriptions/${sub.data?.id}`, { active: false }), 204);
  expectStatus("gasto a devolver sin quién → 400", await post("/api/cash", { direction: "egreso", amount: 100, concept: "x", occurredOn: TODAY, reimbursable: true }), 400);
  const cash = await post("/api/cash", { direction: "egreso", amount: 2500000, concept: `Hosting E2E ${RUN}`, occurredOn: TODAY, paidById: ctx.me.id, reimbursable: true });
  expectStatus("gasto a devolver", cash, 201);
  expectStatus("marcar devuelto", await post(`/api/cash/${cash.data?.id}/reimburse`), 204);
  expectStatus("devolverlo de nuevo → 409", await post(`/api/cash/${cash.data?.id}/reimburse`), 409);
  const mov = await get(`/api/cash?month=${month}`);
  check("los cobros entraron a la caja", mov.data?.filter((m) => m.client?.id === ctx.clientId && m.direction === "ingreso").length >= 2);
  const sum = await get("/api/finance/summary");
  expectStatus("resumen de finanzas", sum, 200);
  check("cobrado del mes > 0", sum.data?.collectedThisMonth > 0, sum.data);
});

await section("Accesos (claves cifradas)", async () => {
  const secret = `E2E-${RUN}-${Math.random().toString(36).slice(2)}`;
  const c = await post("/api/credentials", { clientId: ctx.clientId, kind: "panel", label: `Panel E2E ${RUN}`, username: "admin", secret, connectUrl: "https://example.com" });
  expectStatus("guardar acceso", c, 201);
  expectStatus("link javascript: rechazado", await post("/api/credentials", { clientId: ctx.clientId, kind: "otro", label: "x", secret: "x", connectUrl: "javascript:alert(1)" }), 400);
  const list = await get(`/api/credentials?q=${encodeURIComponent(`Panel E2E ${RUN}`)}`);
  check("el listado no trae la clave", list.status === 200 && !JSON.stringify(list.data).includes(secret));
  const r = await post(`/api/credentials/${c.data?.id}/reveal`, { action: "ver" });
  expectStatus("ver clave", r, 200);
  check("devuelve la clave correcta", r.data?.secret === secret);
  check("sin caché", /no-store/.test(r.headers.get("cache-control") ?? ""), r.headers.get("cache-control"));
  expectStatus("editar sin cambiar la clave", await patch(`/api/credentials/${c.data?.id}`, { notes: "nota" }), 204);
  const r2 = await post(`/api/credentials/${c.data?.id}/reveal`, { action: "copiar" });
  check("la clave sigue igual después de editar", r2.data?.secret === secret);
  const logs = await get(`/api/credentials/logs?q=${encodeURIComponent(`Panel E2E ${RUN}`)}`);
  const actions = (logs.data ?? []).map((l) => l.action).sort();
  check("historial: crear, ver, editar, copiar", ["copiar", "crear", "editar", "ver"].every((a) => actions.includes(a)), actions);
  expectStatus("borrar acceso", await del(`/api/credentials/${c.data?.id}`), 204);
  expectStatus("ver borrado → 404", await post(`/api/credentials/${c.data?.id}/reveal`, { action: "ver" }), 404);
  const logs2 = await get(`/api/credentials/logs?q=${encodeURIComponent(`Panel E2E ${RUN}`)}`);
  check("el historial se conserva después de borrar", (logs2.data ?? []).some((l) => l.action === "eliminar"));
});

await section("Automatizaciones", async () => {
  const rules = (await get("/api/automations")).data ?? [];
  const byName = (n) => rules.find((r) => r.name === n);
  for (const n of ["Facturar abonos", "Tarea de cobranza", "Cliente sin contacto"]) {
    const r = byName(n);
    const run1 = await post(`/api/automations/${r?.id}/run`);
    expectStatus(`ejecutar "${n}"`, run1, 200);
    const run2 = await post(`/api/automations/${r?.id}/run`);
    check(`"${n}" no duplica al correr dos veces`, run2.data?.affected === 0, run2.data);
  }
  const wa = byName("Recordatorio de cuota");
  expectStatus("no deja activar una regla que necesita WhatsApp", await patch(`/api/automations/${wa?.id}`, { enabled: true }), 400);
  const vg = byName("Venta ganada");
  expectStatus("no deja pausar Venta ganada", await patch(`/api/automations/${vg?.id}`, { enabled: false }), 400);
  const pe = byName("Proyecto excedido");
  const wasEnabled = pe?.enabled;
  expectStatus("activar Proyecto excedido", await patch(`/api/automations/${pe?.id}`, { enabled: true }), 204);
  const run = await post(`/api/automations/${pe?.id}/run`);
  expectStatus("ejecutar Proyecto excedido", run, 200);
  const p = await get(`/api/projects/${ctx.projectId}`);
  check("el proyecto pasado de horas quedó en riesgo", p.data?.status === "en_riesgo", p.data?.status);
  expectStatus("dejarla como estaba", await patch(`/api/automations/${pe?.id}`, { enabled: !!wasEnabled }), 204);
  const after = (await get("/api/automations")).data ?? [];
  check("las ejecuciones se cuentan", after.reduce((a, r) => a + r.runsThisMonth, 0) > 0);
});

await section("Logout", async () => {
  expectStatus("cerrar sesión", await post("/api/auth/sign-out", {}), 200);
  jar.clear();
  expectStatus("después del logout no hay acceso", await get("/api/clients"), 401);
});

console.log(`\n${passed} chequeos OK · ${failures.length} fallas`);
if (failures.length) {
  console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
  process.exit(1);
}
