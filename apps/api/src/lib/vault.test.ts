import { describe, expect, it, vi } from "vitest";

vi.mock("../env", () => ({ env: { VAULT_KEY: Buffer.alloc(32, 7).toString("base64"), VAULT_KEY_VERSION: 1 } }));
const { decryptSecret, encryptSecret } = await import("./vault");

describe("vault", () => {
  it("cifra y descifra", () => {
    const { ciphertext, keyVersion } = encryptSecret("Clave-Ñandú-123!");
    expect(ciphertext).not.toContain("Clave");
    expect(decryptSecret(ciphertext, keyVersion)).toBe("Clave-Ñandú-123!");
  });

  it("cada cifrado usa un IV distinto", () => {
    expect(encryptSecret("x").ciphertext).not.toBe(encryptSecret("x").ciphertext);
  });

  it("detecta que alguien tocó el texto cifrado", () => {
    const { ciphertext } = encryptSecret("secreto");
    const raw = Buffer.from(ciphertext, "base64");
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 1;
    expect(() => decryptSecret(raw.toString("base64"), 1)).toThrow("No se pudo descifrar");
  });

  it("rechaza una versión de clave distinta", () => {
    expect(() => decryptSecret(encryptSecret("x").ciphertext, 2)).toThrow("clave anterior");
  });
});
