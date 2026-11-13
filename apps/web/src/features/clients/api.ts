/**
 * Datos de Clientes para el front: claves de caché y hooks de TanStack Query.
 * Cada mutación invalida exactamente lo que cambia (lista, ficha, timeline).
 */
import type {
  ActivityCreate,
  ActivityDto,
  BillingProfileInput,
  ClientCreate,
  ClientDetail,
  ClientListItem,
  ClientListQuery,
  ClientProjectDto,
  ClientStatusChange,
  ClientSummaryCounts,
  ClientTaskDto,
  ClientUpdate,
  ContactInput,
  Page,
  StatementDto,
} from "@crm/shared";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

type ListFilters = Pick<ClientListQuery, "q" | "status" | "priority">;

export const clientKeys = {
  all: ["clients"] as const,
  list: (f: ListFilters) => ["clients", "list", f] as const,
  summary: ["clients", "summary"] as const,
  detail: (id: string) => ["clients", id] as const,
  activities: (id: string) => ["clients", id, "activities"] as const,
  tasks: (id: string) => ["clients", id, "tasks"] as const,
  statement: (id: string, from?: string, to?: string) => ["clients", id, "statement", from, to] as const,
  projects: (id: string) => ["clients", id, "projects"] as const,
};

export function useClients(filters: ListFilters) {
  return useInfiniteQuery({
    queryKey: clientKeys.list(filters),
    queryFn: ({ pageParam }) =>
      api.get<Page<ClientListItem>>("/api/clients", { ...filters, cursor: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export const useClientSummary = () =>
  useQuery({ queryKey: clientKeys.summary, queryFn: () => api.get<ClientSummaryCounts>("/api/clients/summary") });

export const useClient = (id: string) =>
  useQuery({ queryKey: clientKeys.detail(id), queryFn: () => api.get<ClientDetail>(`/api/clients/${id}`) });

export function useActivities(id: string) {
  return useInfiniteQuery({
    queryKey: clientKeys.activities(id),
    queryFn: ({ pageParam }) =>
      api.get<Page<ActivityDto>>(`/api/clients/${id}/activities`, { cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export const useClientTasks = (id: string) =>
  useQuery({ queryKey: clientKeys.tasks(id), queryFn: () => api.get<ClientTaskDto[]>(`/api/clients/${id}/tasks`) });

export const useStatement = (id: string, from?: string, to?: string) =>
  useQuery({
    queryKey: clientKeys.statement(id, from, to),
    queryFn: () => api.get<StatementDto>(`/api/clients/${id}/statement`, { from, to }),
    placeholderData: keepPreviousData,
  });

export const useClientProjects = (id: string) =>
  useQuery({
    queryKey: clientKeys.projects(id),
    queryFn: () => api.get<ClientProjectDto[]>(`/api/clients/${id}/projects`),
  });

// ─── Mutaciones ─────────────────────────────────────────────────────────────

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ClientCreate) => api.post<{ id: string }>("/api/clients", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: clientKeys.all }),
  });
}

/** Invalida la ficha, su timeline (los cambios dejan rastro) y los listados. */
function useClientMutation<V>(id: string, fn: (vars: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: clientKeys.detail(id) }),
        qc.invalidateQueries({ queryKey: ["clients", "list"] }),
        qc.invalidateQueries({ queryKey: clientKeys.summary }),
      ]);
    },
  });
}

export const useUpdateClient = (id: string) =>
  useClientMutation(id, (input: ClientUpdate) => api.patch(`/api/clients/${id}`, input));

export const useChangeStatus = (id: string) =>
  useClientMutation(id, (input: ClientStatusChange) => api.post(`/api/clients/${id}/status`, input));

export const useSaveContact = (id: string) =>
  useClientMutation(id, ({ contactId, ...input }: ContactInput & { contactId?: string }) =>
    contactId
      ? api.patch(`/api/clients/${id}/contacts/${contactId}`, input)
      : api.post(`/api/clients/${id}/contacts`, input),
  );

export const useRemoveContact = (id: string) =>
  useClientMutation(id, (contactId: string) => api.delete(`/api/clients/${id}/contacts/${contactId}`));

export const useSaveBilling = (id: string) =>
  useClientMutation(id, (input: BillingProfileInput) => api.put(`/api/clients/${id}/billing`, input));

export function useAddActivity(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ActivityCreate) => api.post(`/api/clients/${id}/activities`, input),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: clientKeys.activities(id) }),
        qc.invalidateQueries({ queryKey: clientKeys.detail(id) }),
      ]),
  });
}
