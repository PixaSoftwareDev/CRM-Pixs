/** Datos de Accesos. La clave en texto plano nunca entra al caché de TanStack Query. */
import type { AccessLogDto, CredentialCreate, CredentialDto, CredentialUpdate } from "@crm/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

/** Filtros del historial (todos opcionales). */
export interface LogFilters {
  q?: string;
  from?: string;
  to?: string;
  clientId?: string;
  userId?: string;
}

export const vaultKeys = {
  all: ["vault"] as const,
  list: (q: string) => ["vault", "list", q] as const,
  logs: (f: LogFilters) => ["vault", "logs", f] as const,
};

export const useCredentials = (q: string) =>
  useQuery({
    queryKey: vaultKeys.list(q),
    queryFn: () => api.get<CredentialDto[]>("/api/credentials", { q }),
    placeholderData: keepPreviousData,
  });

export const useAccessLogs = (f: LogFilters, enabled: boolean) =>
  useQuery({
    queryKey: vaultKeys.logs(f),
    queryFn: () => api.get<AccessLogDto[]>("/api/credentials/logs", { ...f }),
    enabled,
    placeholderData: keepPreviousData,
  });

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: vaultKeys.all });
}

export function useCreateCredential() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (b: CredentialCreate) => api.post<{ id: string }>("/api/credentials", b), onSuccess: invalidate });
}

export function useUpdateCredential() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...b }: CredentialUpdate & { id: string }) => api.patch(`/api/credentials/${id}`, b),
    onSuccess: invalidate,
  });
}

export function useDeleteCredential() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => api.delete(`/api/credentials/${id}`), onSuccess: invalidate });
}

/**
 * Pide la clave (queda registrado). Es una mutación a propósito: no se cachea
 * ni se reintenta sola; la clave vive solo en el estado del componente.
 */
export function useReveal() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "ver" | "copiar" }) =>
      api.post<{ secret: string }>(`/api/credentials/${id}/reveal`, { action }),
    onSuccess: invalidate,
  });
}
