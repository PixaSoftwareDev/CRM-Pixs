import { createRootRoute, createRoute, createRouter, lazyRouteComponent } from "@tanstack/react-router";
import { z } from "zod";
import {
  CLIENT_PRIORITIES,
  CLIENT_STATUSES,
  PROJECT_HEALTHS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TYPES,
} from "@crm/shared";
import { AppLayout } from "./components/layout/AppLayout";
import { BASE } from "./lib/base";

/**
 * Cada pantalla se descarga recién al entrar (o al pasar el mouse por el link,
 * con defaultPreload): la primera carga solo trae el layout y la pantalla actual.
 */
const page = {
  ClientDetailPage: lazyRouteComponent(() => import("./features/clients/ClientDetailPage"), "ClientDetailPage"),
  ClientsPage: lazyRouteComponent(() => import("./features/clients/ClientsPage"), "ClientsPage"),
  AutomationsPage: lazyRouteComponent(() => import("./features/automations/AutomationsPage"), "AutomationsPage"),
  FinancePage: lazyRouteComponent(() => import("./features/finance/FinancePage"), "FinancePage"),
  AccessPage: lazyRouteComponent(() => import("./features/vault/AccessPage"), "AccessPage"),
  ProjectDetailPage: lazyRouteComponent(() => import("./features/projects/ProjectDetailPage"), "ProjectDetailPage"),
  ProjectsPage: lazyRouteComponent(() => import("./features/projects/ProjectsPage"), "ProjectsPage"),
  PipelinePage: lazyRouteComponent(() => import("./features/sales/PipelinePage"), "PipelinePage"),
  AgendaPage: lazyRouteComponent(() => import("./features/tasks/AgendaPage"), "AgendaPage"),
  TicketDetailPage: lazyRouteComponent(() => import("./features/tickets/TicketDetailPage"), "TicketDetailPage"),
  TicketsPage: lazyRouteComponent(() => import("./features/tickets/TicketsPage"), "TicketsPage"),
  MyDayPage: lazyRouteComponent(() => import("./features/tasks/MyDayPage"), "MyDayPage"),
};

const rootRoute = createRootRoute({ component: AppLayout });

/** Filtros del listado en la URL: se comparten por link y sobreviven a recargar. */
const clientsSearch = z.object({
  q: z.string().optional().catch(undefined),
  status: z.enum(CLIENT_STATUSES).optional().catch(undefined),
  priority: z.enum(CLIENT_PRIORITIES).optional().catch(undefined),
});

const clientTabs = z.object({
  tab: z.enum(["actividad", "tareas", "cuenta", "proyectos", "datos"]).optional().catch(undefined),
});

/** Día que se mira y de quién es la agenda (sin parámetros: hoy, la propia). */
const agendaSearch = z.object({
  date: z.iso.date().optional().catch(undefined),
  user: z.union([z.uuid(), z.literal("todos")]).optional().catch(undefined),
});

const myDayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: agendaSearch,
  component: page.MyDayPage,
});

const agendaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agenda",
  validateSearch: agendaSearch,
  component: page.AgendaPage,
});

const clientsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/clientes",
  validateSearch: clientsSearch,
  component: page.ClientsPage,
});

const clientRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/clientes/$clientId",
  validateSearch: clientTabs,
  component: page.ClientDetailPage,
});

const pipelineRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/embudo",
  component: page.PipelinePage,
});

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/proyectos",
  validateSearch: z.object({
    cliente: z.uuid().optional().catch(undefined),
    impl: z.uuid().optional().catch(undefined),
    estado: z.enum(PROJECT_HEALTHS).optional().catch(undefined),
  }),
  component: page.ProjectsPage,
});

const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/proyectos/$projectId",
  component: page.ProjectDetailPage,
});

/** Filtros del buscador de tickets (en la URL, en castellano como el resto). */
const day = z.iso.date().optional().catch(undefined);
const ticketsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tickets",
  validateSearch: z.object({
    nro: z.coerce.number().int().positive().optional().catch(undefined),
    cliente: z.uuid().optional().catch(undefined),
    tipo: z.enum(TICKET_TYPES).optional().catch(undefined),
    urgencia: z.enum(TICKET_PRIORITIES).optional().catch(undefined),
    estado: z.enum(TICKET_STATUSES).optional().catch(undefined),
    abiertos: z.boolean().optional().catch(undefined),
    carga: day,
    compromiso: day,
    resuelto: day,
    resolvio: z.uuid().optional().catch(undefined),
    q: z.string().max(100).optional().catch(undefined),
  }),
  component: page.TicketsPage,
});

const ticketRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tickets/$ticketId",
  component: page.TicketDetailPage,
});

const financeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/finanzas",
  validateSearch: z.object({
    tab: z.enum(["cobrar", "abonos", "movimientos"]).optional().catch(undefined),
    mes: z.string().regex(/^\d{4}-\d{2}$/).optional().catch(undefined),
  }),
  component: page.FinancePage,
});

const accessRoute = createRoute({ getParentRoute: () => rootRoute, path: "/accesos", component: page.AccessPage });
const automationsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/automatizaciones", component: page.AutomationsPage });

const routeTree = rootRoute.addChildren([
  myDayRoute,
  agendaRoute,
  clientsRoute,
  clientRoute,
  pipelineRoute,
  projectsRoute,
  projectRoute,
  ticketsRoute,
  ticketRoute,
  financeRoute,
  accessRoute,
  automationsRoute,
]);

export const router = createRouter({ routeTree, defaultPreload: "intent", basepath: BASE || "/" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export { financeRoute, agendaRoute, clientRoute, clientsRoute, myDayRoute, projectRoute, projectsRoute, ticketRoute, ticketsRoute };
