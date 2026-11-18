import { clientCreate, clientUpdate, contactInput, cuitSearchDigits, isValidPhone, numberSearchDigits, opportunityCreate } from "@crm/shared";
import { describe, expect, it } from "vitest";

describe("teléfono", () => {
  it("acepta los formatos de siempre", () => {
    for (const v of ["+54 11 4567-8910", "(011) 4567-8910", "3515553", "11.4567.8910", "4567-8910 int. 23", "4567 8910 ext 5", "11 4444-5555 / 11 6666-7777"]) {
      expect(isValidPhone(v), v).toBe(true);
    }
  });

  it("rechaza texto libre", () => {
    for (const v of ["llamar a la tarde", "abc", "11-hola-22", "+", "---", "int. 23"]) {
      expect(isValidPhone(v), v).toBe(false);
    }
  });

  it("vacío sigue siendo válido (no se carga) y el error cae en el campo", () => {
    expect(clientUpdate.safeParse({ phone: "" }).success).toBe(true);
    const bad = clientCreate.safeParse({ name: "X", phone: "no tiene" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.path).toEqual(["phone"]);
    expect(contactInput.safeParse({ name: "Ana", phone: "lunes" }).success).toBe(false);
  });

  it("también al cargar un cliente nuevo desde el embudo", () => {
    const base = { title: "Web", newClient: { name: "Nuevo" } };
    expect(opportunityCreate.safeParse({ ...base, newClient: { name: "Nuevo", phone: "" } }).success).toBe(true);
    expect(opportunityCreate.safeParse({ ...base, newClient: { name: "Nuevo", phone: "tel" } }).success).toBe(false);
  });
});

describe("búsqueda por CUIT", () => {
  it("ignora guiones, puntos y espacios", () => {
    expect(cuitSearchDigits("30-71234567-1")).toBe("30712345671");
    expect(cuitSearchDigits(" 30 7123 ")).toBe("307123");
    expect(cuitSearchDigits("123")).toBe("123");
  });

  it("texto con letras o muy corto no es un CUIT", () => {
    expect(cuitSearchDigits("Local 2")).toBeNull();
    expect(cuitSearchDigits("12")).toBeNull();
    expect(cuitSearchDigits("--")).toBeNull();
  });
});

describe("buscador de clientes por número", () => {
  it("teléfonos y CUIT con separadores quedan en dígitos", () => {
    expect(numberSearchDigits("(011) 4567-8910")).toBe("01145678910");
    expect(numberSearchDigits("+54 11 5555")).toBe("54115555");
    expect(numberSearchDigits("30-71234567-8")).toBe("30712345678");
  });

  it("texto o muy pocos dígitos no es un número", () => {
    expect(numberSearchDigits("Local 2")).toBeNull();
    expect(numberSearchDigits("12")).toBeNull();
    expect(numberSearchDigits("ana@mail.com")).toBeNull();
  });
});
