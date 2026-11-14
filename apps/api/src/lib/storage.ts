import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { env } from "../env";

/**
 * Archivos subidos, en el disco (en el VPS, el volumen `crm-files`). En la base
 * solo va la metadata. En el disco el archivo se llama con una clave generada
 * (`2026/11/<uuid>`): el nombre que eligió el usuario nunca llega a una ruta.
 */
const ROOT = path.resolve(env.FILES_DIR);

const KEY = /^\d{4}\/\d{2}\/[0-9a-f-]{36}$/;

function fullPath(key: string): string {
  if (!KEY.test(key)) throw new Error(`Clave de archivo inválida: ${key}`);
  return path.join(ROOT, key);
}

export class FileTooLargeError extends Error {}

/**
 * Guarda el stream y devuelve su clave y tamaño. Se escribe a un `.part` y se
 * renombra al final: un archivo cortado (muy grande o conexión caída) no queda.
 */
export async function saveFile(stream: Readable & { truncated?: boolean }): Promise<{ key: string; size: number }> {
  const now = new Date();
  const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}`;
  const dest = fullPath(key);
  const part = `${dest}.part`;
  await mkdir(path.dirname(dest), { recursive: true });
  try {
    await pipeline(stream, createWriteStream(part, { flags: "wx" }));
    if (stream.truncated) throw new FileTooLargeError();
    await rename(part, dest);
  } catch (err) {
    await unlink(part).catch(() => undefined);
    throw err;
  }
  return { key, size: (await stat(dest)).size };
}

export const openFile = (key: string) => createReadStream(fullPath(key));

/** Borra del disco. Si ya no estaba, no es un error. */
export async function removeFile(key: string): Promise<void> {
  await unlink(fullPath(key)).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== "ENOENT") throw err;
  });
}
