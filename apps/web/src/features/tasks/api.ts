/**
 * Datos de Tareas para el front. Cualquier cambio en una tarea invalida la
 * agenda, el Cliente 360, el embudo (lo mueven las tareas) y los proyectos.
 */
import type {
  TaskCommentCreate,
  TaskCreate,
  TaskDetailDto,
  TaskDto,
  TaskTypeCreate,
  TaskTypeDto,
  TaskUpdate,
  TeamMember,
} from "@pixs/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { authClient } from "../../lib/auth-client";

export const taskKeys = {
  all: ["tasks"] as const,
  range: (from: string, to: string) => ["tasks", "range", from, to] as const,
  detail: (id: string) => ["tasks", "detail", id] as const,
  types: ["task-types"] as const,
  team: ["team"] as const,
  clientOptions: ["clients", "options"] as const,
};

/** Catálogos que cambian poco: se piden una vez y se reusan en toda la app. */
const CATALOG = { staleTime: 5 * 60_000 };

export const useTasksInRange = (from: string, to: string) =>
  useQuery({
    queryKey: taskKeys.range(from, to),
    queryFn: () => api.get<TaskDto[]>("/api/tasks", { from, to }),
    placeholderData: keepPreviousData,
  });

export const useTask = (id: string | null) =>
  useQuery({
    queryKey: taskKeys.detail(id ?? ""),
    queryFn: () => api.get<TaskDetailDto>(`/api/tasks/${id}`),
    enabled: !!id,
  });

export const useTaskTypes = () =>
  useQuery({ queryKey: taskKeys.types, queryFn: () => api.get<TaskTypeDto[]>("/api/task-types"), ...CATALOG });

export const useTeam = () =>
  useQuery({ queryKey: taskKeys.team, queryFn: () => api.get<TeamMember[]>("/api/team"), ...CATALOG });

export const useClientOptions = () =>
  useQuery({
    queryKey: taskKeys.clientOptions,
    queryFn: () => api.get<{ id: string; name: string }[]>("/api/clients/options"),
    ...CATALOG,
  });

/** Id del usuario logueado (la sesión ya está cargada: AuthGate no deja pasar sin ella). */
export function useMyId(): string {
  return authClient.useSession().data?.user.id ?? "";
}

function useInvalidateTasks() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: taskKeys.all }),
      qc.invalidateQueries({ queryKey: taskKeys.types }),
      qc.invalidateQueries({ queryKey: ["clients"] }),
      // Las tareas mueven el embudo y alimentan los proyectos.
      qc.invalidateQueries({ queryKey: ["pipeline"] }),
      qc.invalidateQueries({ queryKey: ["projects"] }),
      qc.invalidateQueries({ queryKey: ["tickets"] }),
    ]);
}

export function useCreateTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (body: TaskCreate) => api.post<{ id: string }>("/api/tasks", body),
    onSuccess: invalidate,
  });
}

export function useUpdateTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: ({ id, ...body }: TaskUpdate & { id: string }) => api.patch(`/api/tasks/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useAddTaskComment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TaskCommentCreate) => api.post(`/api/tasks/${id}/comments`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.detail(id) }),
  });
}

export function useCreateTaskType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TaskTypeCreate) => api.post<{ id: string }>("/api/task-types", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.types }),
  });
}

export function useDeleteTaskType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/task-types/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.types }),
  });
}
