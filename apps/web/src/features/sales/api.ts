/** Datos del Embudo para el front. */
import type {
  OpportunityCardDto,
  OpportunityCreate,
  OpportunityLose,
  OpportunityWin,
  PipelineDto,
} from "@pixs/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

export const salesKeys = {
  pipeline: ["pipeline"] as const,
  stage: (id: string) => ["pipeline", "stage", id] as const,
};

export const usePipeline = () =>
  useQuery({ queryKey: salesKeys.pipeline, queryFn: () => api.get<PipelineDto>("/api/pipeline") });

export const useStageOpportunities = (stageId: string | null) =>
  useQuery({
    queryKey: salesKeys.stage(stageId ?? ""),
    queryFn: () => api.get<OpportunityCardDto[]>(`/api/pipeline/stages/${stageId}/opportunities`),
    enabled: !!stageId,
  });

/** Cualquier acción del embudo puede tocar clientes, tareas y proyectos. */
function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [["pipeline"], ["clients"], ["tasks"], ["projects"]].map((queryKey) => qc.invalidateQueries({ queryKey })),
    );
}

export function useCreateOpportunity() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: OpportunityCreate) => api.post<{ id: string; clientId: string }>("/api/opportunities", body),
    onSuccess: invalidate,
  });
}

export function useMoveOpportunity() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, stageId }: { id: string; stageId: string }) => api.post(`/api/opportunities/${id}/move`, { stageId }),
    onSuccess: invalidate,
  });
}

export function useWinOpportunity(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: OpportunityWin) => api.post<{ projectId: string }>(`/api/opportunities/${id}/win`, body),
    onSuccess: invalidate,
  });
}

export function useLoseOpportunity(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: OpportunityLose) => api.post(`/api/opportunities/${id}/lose`, body),
    onSuccess: invalidate,
  });
}
