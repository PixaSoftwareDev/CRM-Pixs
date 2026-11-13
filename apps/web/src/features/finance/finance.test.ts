import { describe, expect, it } from "vitest";
import { parsePesos } from "../../lib/format";
import { buildInstallments } from "./InstallmentsCard";
import { parseMovement } from "./quick-movement";

const clients = [
  { id: "espiga", name: "Panadería La Espiga" },
  { id: "ruiz", name: "Estudio Ruiz & Asoc." },
];

describe("parseMovement", () => {
  it("un gasto con importe y concepto", () => {
    expect(parseMovement("pagué 25000 de hosting", clients)).toEqual({ direction: "egreso", amount: 2_500_000, clientId: null, concept: "Hosting" });
  });

  it("un cobro de un cliente, con puntos de miles", () => {
    expect(parseMovement("cobré 150.000 de La Espiga", clients)).toMatchObject({ direction: "ingreso", amount: 15_000_000, clientId: "espiga" });
  });

  it("entiende k, mil y decimales con coma", () => {
    expect(parseMovement("compré licencias por 25k", clients).amount).toBe(2_500_000);
    expect(parseMovement("gasté 12.500,50 en dominio", clients).amount).toBe(1_250_050);
    expect(parseMovement("cobro Ruiz 3 mil", clients)).toMatchObject({ amount: 300_000, clientId: "ruiz" });
  });

  it("sin importe devuelve 0 para que lo complete el formulario", () => {
    expect(parseMovement("pagué el hosting", clients).amount).toBe(0);
  });
});

describe("parsePesos", () => {
  it("acepta el formato argentino", () => {
    expect(parsePesos("150.000")).toBe(15_000_000);
    expect(parsePesos("$ 1.234,5")).toBe(123_450);
    expect(parsePesos("")).toBe(0);
    expect(parsePesos("abc")).toBeNull();
  });
});

describe("buildInstallments", () => {
  it("anticipo + cuotas mensuales; el redondeo va a la última", () => {
    const items = buildInstallments(100_000_00, 50, 3, "2026-12-10", "2026-11-13");
    expect(items).toEqual([
      { number: 0, amount: 50_000_00, dueOn: "2026-11-13" },
      { number: 1, amount: 16_666_00, dueOn: "2026-12-10" },
      { number: 2, amount: 16_666_00, dueOn: "2027-01-10" },
      { number: 3, amount: 16_668_00, dueOn: "2027-02-10" },
    ]);
    expect(items.reduce((a, i) => a + i.amount, 0)).toBe(100_000_00);
  });

  it("un vencimiento el 31 cae el 28 todos los meses", () => {
    expect(buildInstallments(30_000_00, 0, 2, "2027-01-31", "2026-11-13").map((i) => i.dueOn)).toEqual(["2027-01-28", "2027-02-28"]);
  });
});
