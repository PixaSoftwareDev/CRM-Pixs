/** Contenedor de archivos: listar, subir (con avance), borrar. */
import type { FileDto, FileOwnerQuery } from "@crm/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import { BASE } from "../../lib/base";

export const fileKeys = {
  all: ["files"] as const,
  list: (owner: FileOwnerQuery) => ["files", owner] as const,
};

export const useFiles = (owner: FileOwnerQuery, enabled = true) =>
  useQuery({ queryKey: fileKeys.list(owner), queryFn: () => api.get<FileDto[]>("/api/files", owner), enabled });

/** Dónde se abre (o descarga) un archivo: la API exige la sesión, así que va con la cookie. */
export const fileUrl = (id: string, download = false) => `${BASE}/api/files/${id}${download ? "?download=1" : ""}`;

/** Sube un archivo y avisa el avance (fetch no informa el progreso de subida; XHR sí). */
export function uploadFile(owner: FileOwnerQuery, file: File, onProgress: (fraction: number) => void): Promise<FileDto> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const qs = new URLSearchParams(owner as Record<string, string>).toString();
    xhr.open("POST", `${BASE}/api/files?${qs}`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: { error?: string } | null = null;
      try {
        body = JSON.parse(xhr.responseText) as { error?: string };
      } catch {
        // nginx contesta HTML cuando corta por tamaño
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body as unknown as FileDto);
      if (xhr.status === 401) window.dispatchEvent(new Event("auth:expired"));
      const msg = xhr.status === 413 ? (body?.error ?? "El archivo es demasiado grande.") : (body?.error ?? "No se pudo subir. Probá de nuevo.");
      reject(new ApiError(xhr.status, msg));
    };
    xhr.onerror = () => reject(new ApiError(0, "Se cortó la conexión. Probá de nuevo."));
    const form = new FormData();
    form.append("file", file, file.name);
    xhr.send(form);
  });
}

/** Lo que cambia al subir o borrar: los archivos y, si es de un ticket, su historial. */
export function useFilesChanged() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: fileKeys.all }), qc.invalidateQueries({ queryKey: ["tickets"] })]);
}

export function useDeleteFile() {
  const changed = useFilesChanged();
  return useMutation({ mutationFn: (id: string) => api.delete(`/api/files/${id}`), onSuccess: changed });
}
