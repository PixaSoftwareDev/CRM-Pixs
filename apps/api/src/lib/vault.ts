/**
 * Cifrado de las claves de Accesos: AES-256-GCM (autenticado: si alguien toca
 * el texto cifrado en la base, descifrar falla en vez de devolver basura).
 * Formato guardado: base64(iv[12] ‖ authTag[16] ‖ ciphertext).
 * Nunca inventamos cripto: solo node:crypto con parámetros estándar.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../env";
import { AppError } from "./errors";

const KEY = Buffer.from(env.VAULT_KEY, "base64");
const IV_BYTES = 12;
const TAG_BYTES = 16;

export const VAULT_KEY_VERSION = env.VAULT_KEY_VERSION;

export function encryptSecret(plain: string): { ciphertext: string; keyVersion: number } {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return { ciphertext: Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64"), keyVersion: VAULT_KEY_VERSION };
}

export function decryptSecret(ciphertext: string, keyVersion: number): string {
  if (keyVersion !== VAULT_KEY_VERSION) {
    // Rotación: hasta re-cifrar, una clave vieja no se puede leer con la nueva.
    throw new AppError(409, "Este acceso está cifrado con una clave anterior: hay que re-cifrarlo");
  }
  const raw = Buffer.from(ciphertext, "base64");
  const decipher = createDecipheriv("aes-256-gcm", KEY, raw.subarray(0, IV_BYTES));
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  try {
    return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
  } catch {
    throw new AppError(500, "No se pudo descifrar el acceso");
  }
}
