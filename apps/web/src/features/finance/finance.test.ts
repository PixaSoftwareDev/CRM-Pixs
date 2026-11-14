import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "../../lib/csv";
import { centsToInput, parsePesos } from "../../lib/format";
import { buildInstallments, planProblem } from "./InstallmentsCard";
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

  it("punto decimal y k con decimales", () => {
    expect(parseMovement("pagué 1500.50 de hosting", clients).amount).toBe(150_050);
    expect(parseMovement("compré licencias por 1.5k", clients).amount).toBe(150_000);
    expect(parseMovement("cobré 1.500.000 de La Espiga", clients).amount).toBe(150_000_000);
  });

  it('"me pagó" es un ingreso (no un gasto por contener "pago")', () => {
    const qa = [...clients, { id: "alfa", name: "QA-FIN Alfa" }];
    expect(parseMovement("QA-FIN Alfa me pagó 5000", qa)).toMatchObject({ direction: "ingreso", amount: 500_000, clientId: "alfa" });
    expect(parseMovement("La Espiga nos transfirió 20000", clients)).toMatchObject({ direction: "ingreso", clientId: "espiga" });
    expect(parseMovement("Ruiz pagó 3000", clients).direction).toBe("ingreso");
    expect(parseMovement("pago de hosting 3000", clients).direction).toBe("egreso");
    expect(parseMovement("pagamos el dominio 9000", clients).direction).toBe("egreso");
  });

  it("los números que cuentan cosas no son el importe", () => {
    expect(parseMovement("pagué 2 meses de hosting por 3000", clients)).toEqual({ direction: "egreso", amount: 300_000, clientId: null, concept: "Hosting" });
    expect(parseMovement("compré 3 licencias por 25k", clients).amount).toBe(2_500_000);
    expect(parseMovement("cobré 2 cuotas de Ruiz $ 40.000", clients)).toMatchObject({ amount: 4_000_000, clientId: "ruiz" });
  });
});

describe("parsePesos", () => {
  it("acepta el formato argentino", () => {
    expect(parsePesos("150.000")).toBe(15_000_000);
    expect(parsePesos("$ 1.234,5")).toBe(123_450);
    expect(parsePesos("1.500.000")).toBe(150_000_000);
    expect(parsePesos("1500,50")).toBe(150_050);
    expect(parsePesos("")).toBe(0);
    expect(parsePesos("abc")).toBeNull();
  });

  it("un único punto con 1 o 2 decimales es punto decimal", () => {
    expect(parsePesos("1500.50")).toBe(150_050);
    expect(parsePesos("1500.5")).toBe(150_050);
    expect(parsePesos("0.99")).toBe(99);
    expect(parsePesos("1.500")).toBe(150_000);
  });

  it("rechaza lo ambiguo en vez de adivinar", () => {
    expect(parsePesos("1.50.0")).toBeNull();
    expect(parsePesos("1.5000")).toBeNull();
    expect(parsePesos("1,500.50")).toBeNull();
    expect(parsePesos("-100")).toBeNull();
  });

  it("es el inverso de centsToInput", () => {
    for (const cents of [0, 1, 5, 10, 99, 100, 123_456, 150_050, 15_000_000, 999_999_999_99]) {
      expect(parsePesos(centsToInput(cents))).toBe(cents);
    }
  });
});

describe("csv", () => {
  it("neutraliza fórmulas en textos", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell("+54 11 5555")).toBe("'+54 11 5555");
    expect(csvCell("-algo")).toBe("'-algo");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tcmd")).toBe("'\tcmd");
    expect(csvCell("Hosting")).toBe("Hosting");
  });

  it("los importes negativos siguen siendo números", () => {
    expect(csvCell(-1500.5)).toBe("-1500,5");
    expect(toCsv(["A", "B"], [["x;y", null]])).toBe('A;B\r\n"x;y";');
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

  it("el plan tiene que cerrar: anticipo 0–100% y el resto en cuotas", () => {
    const ok = buildInstallments(100_000_00, 30, 2, "2026-12-10", "2026-11-13");
    expect(planProblem(100_000_00, 30, 2, ok)).toBeNull();
    expect(planProblem(100_000_00, 150, 2, [])).toBe("El anticipo va de 0 a 100%.");
    // Sin cuotas, el resto se perdía sin aviso.
    expect(planProblem(100_000_00, 30, 0, buildInstallments(100_000_00, 30, 0, "2026-12-10", "2026-11-13"))).toBe(
      "Indicá en cuántas cuotas se paga el resto.",
    );
    // 100% de anticipo: una sola cuota (la 0) por el total.
    expect(planProblem(100_000_00, 100, 3, buildInstallments(100_000_00, 100, 3, "2026-12-10", "2026-11-13"))).toBeNull();
    expect(planProblem(100, 0, 5, buildInstallments(100, 0, 5, "2026-12-10", "2026-11-13"))).not.toBeNull();
  });

  it("un vencimiento el 31 cae el 28 todos los meses", () => {
    expect(buildInstallments(30_000_00, 0, 2, "2027-01-31", "2026-11-13").map((i) => i.dueOn)).toEqual(["2027-01-28", "2027-02-28"]);
  });
});
