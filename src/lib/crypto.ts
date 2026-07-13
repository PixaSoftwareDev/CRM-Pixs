import "server-only"
import sodium from "libsodium-wrappers"
import { serverEnv } from "@/lib/env"

/**
 * Cifrado autenticado de secretos que SÍ deben vivir en la app (§4.1).
 * XChaCha20-Poly1305 (secretbox) con clave maestra desde ENCRYPTION_KEY (env).
 * NUNCA inventamos cifrado propio: esto es libsodium.
 *
 * Para credenciales *vivas de producción* preferí guardar una REFERENCIA a un
 * gestor (campo credencial_ref), no el secreto. Usá esto solo cuando no haya
 * alternativa.
 */

let ready: Promise<void> | undefined
async function init() {
  ready ??= sodium.ready
  await ready
}

function key() {
  const raw = serverEnv().ENCRYPTION_KEY
  const k = sodium.from_base64(raw, sodium.base64_variants.ORIGINAL)
  if (k.length !== sodium.crypto_secretbox_KEYBYTES) {
    throw new Error("ENCRYPTION_KEY debe ser 32 bytes en base64")
  }
  return k
}

/** Devuelve "nonce.ciphertext" en base64, listo para guardar en texto. */
export async function encryptSecret(plaintext: string): Promise<string> {
  await init()
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
  const cipher = sodium.crypto_secretbox_easy(sodium.from_string(plaintext), nonce, key())
  const b64 = (b: Uint8Array) => sodium.to_base64(b, sodium.base64_variants.ORIGINAL)
  return `${b64(nonce)}.${b64(cipher)}`
}

export async function decryptSecret(payload: string): Promise<string> {
  await init()
  const [n, c] = payload.split(".")
  if (!n || !c) throw new Error("Formato de secreto inválido")
  const from = (s: string) => sodium.from_base64(s, sodium.base64_variants.ORIGINAL)
  const plain = sodium.crypto_secretbox_open_easy(from(c), from(n), key())
  return sodium.to_string(plain)
}
