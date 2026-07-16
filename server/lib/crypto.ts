import sodium from "libsodium-wrappers"

/**
 * Cifrado de secretos de credenciales — MISMA lógica que `src/lib/crypto.ts`
 * (libsodium XChaCha20-Poly1305 / secretbox, clave desde ENCRYPTION_KEY base64
 * de 32 bytes). Copiado sin `import "server-only"` porque esa línea está pensada
 * para el bundler de Next y rompe en un proceso Node plano. El formato de salida
 * ("nonce.ciphertext" en base64) es idéntico, así los secretos cifrados por el
 * front se descifran acá y viceversa.
 */

let ready: Promise<void> | undefined
async function init() {
  ready ??= sodium.ready
  await ready
}

function key() {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) throw new Error("ENCRYPTION_KEY no configurada")
  const k = sodium.from_base64(raw, sodium.base64_variants.ORIGINAL)
  if (k.length !== sodium.crypto_secretbox_KEYBYTES) {
    throw new Error("ENCRYPTION_KEY debe ser 32 bytes en base64")
  }
  return k
}

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
