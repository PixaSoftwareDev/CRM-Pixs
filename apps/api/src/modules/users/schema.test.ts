import { userCreate, userUpdate } from "@crm/shared";
import { describe, expect, it } from "vitest";

const base = { name: "Ana", role: "miembro" as const, password: "12345678" };

describe("alta y edición de usuarios", () => {
  it("el email se limpia antes de validarse", () => {
    const r = userCreate.safeParse({ ...base, email: "  Ana@Pixs.COM  " });
    expect(r.success && r.data.email).toBe("ana@pixs.com");
  });

  it("rechaza emails inválidos", () => {
    expect(userCreate.safeParse({ ...base, email: "ana@" }).success).toBe(false);
    expect(userCreate.safeParse({ ...base, email: "   " }).success).toBe(false);
  });

  it("la contraseña no puede ser solo espacios", () => {
    expect(userUpdate.safeParse({ password: "        " }).success).toBe(false);
    expect(userCreate.safeParse({ ...base, email: "a@b.com", password: "        " }).success).toBe(false);
  });

  it("8 caracteres alcanzan, aunque sean solo números o tengan espacios", () => {
    expect(userUpdate.safeParse({ password: "12345678" }).success).toBe(true);
    expect(userUpdate.safeParse({ password: "clave con espacios" }).success).toBe(true);
    expect(userUpdate.safeParse({ password: "1234567" }).success).toBe(false);
  });
});
