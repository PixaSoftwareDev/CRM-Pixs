/** Datos de Tickets para el front. */
import type {
  Page,
  TicketAssign,
  TicketCancel,
  TicketConfirm,
  TicketCreate,
  TicketDetail,
  TicketListItem,
  TicketNote,
  ticketListQuery,
  TicketUpdate,
  TicketWorkDone,
} from "@crm/shared";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { api } from "../../lib/api";

/** Los filtros ya validados (el número llega como número, no como texto). */
type Filters = Partial<Omit<z.output<typeof ticketListQuery>, "cursor" | "limit">>;

export const ticketKeys = {
  all: ["tickets"] as const,
  list: (f: Filters) => ["tickets", "list", f] as const,
  detail: (id: string) => ["tickets", id] as const,
};

export function useTickets(filters: Filters) {
  return useInfiniteQuery({
    queryKey: ticketKeys.list(filters),
    queryFn: ({ pageParam }) =>
      api.get<Page<TicketListItem>>("/api/tickets", { ...filters, cursor: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export const useTicket = (id: string) =>
  useQuery({ queryKey: ticketKeys.detail(id), queryFn: () => api.get<TicketDetail>(`/api/tickets/${id}`) });

/** Un ticket toca su agenda, el proyecto y el Cliente 360. */
function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    Promise.all([["tickets"], ["tasks"], ["projects"], ["clients"]].map((queryKey) => qc.invalidateQueries({ queryKey })));
}

export function useCreateTicket() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: TicketCreate) => api.post<{ id: string; number: number }>("/api/tickets", body),
    onSuccess: invalidate,
  });
}

export function useUpdateTicket(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (body: TicketUpdate) => api.patch(`/api/tickets/${id}`, body), onSuccess: invalidate });
}

/** Acciones del flujo (asignar, terminar, confirmar, cancelar, nota). */
function useAction<B>(id: string, path: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (body: B) => api.post(`/api/tickets/${id}/${path}`, body), onSuccess: invalidate });
}

export const useAssignTicket = (id: string) => useAction<TicketAssign>(id, "assign");
export const useWorkDone = (id: string) => useAction<TicketWorkDone>(id, "work-done");
export const useConfirmTicket = (id: string) => useAction<TicketConfirm>(id, "confirm");
export const useCancelTicket = (id: string) => useAction<TicketCancel>(id, "cancel");
export const useTicketNote = (id: string) => useAction<TicketNote>(id, "notes");
