/** Datos de Proyectos para el front. */
import type { ProjectCreate, ProjectDetail, ProjectListItem, ProjectUpdate } from "@pixs/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

export const projectKeys = {
  all: ["projects"] as const,
  list: ["projects", "list"] as const,
  detail: (id: string) => ["projects", id] as const,
};

export const useProjects = () =>
  useQuery({ queryKey: projectKeys.list, queryFn: () => api.get<ProjectListItem[]>("/api/projects") });

export const useProject = (id: string) =>
  useQuery({ queryKey: projectKeys.detail(id), queryFn: () => api.get<ProjectDetail>(`/api/projects/${id}`) });

function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    Promise.all([qc.invalidateQueries({ queryKey: projectKeys.all }), qc.invalidateQueries({ queryKey: ["clients"] })]);
}

export function useCreateProject() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: ProjectCreate) => api.post<{ id: string }>("/api/projects", body),
    onSuccess: invalidate,
  });
}

export function useUpdateProject(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: ProjectUpdate) => api.patch(`/api/projects/${id}`, body),
    onSuccess: invalidate,
  });
}
