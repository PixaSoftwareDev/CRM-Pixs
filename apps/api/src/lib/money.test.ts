import { describe, expect, it } from "vitest";
import { HIDDEN_AMOUNT, isFinanceActivity, redactAmounts } from "./money";

const pesos = (cents: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(cents / 100);

describe("montos tapados para quien no ve Finanzas", () => {
  it("tapa los montos como los escribe el sistema", () => {
    expect(redactAmounts(`Cobrar a La Espiga: ${pesos(4_500_000)}`)).toBe(`Cobrar a La Espiga: ${HIDDEN_AMOUNT}`);
    expect(redactAmounts(`${pesos(8_000_000)} por efectivo (${pesos(2_000_000)} quedan a favor).`)).toBe(
      `${HIDDEN_AMOUNT} por efectivo (${HIDDEN_AMOUNT} quedan a favor).`,
    );
    expect(redactAmounts("Abono · $ 45.000,50")).toBe(`Abono · ${HIDDEN_AMOUNT}`);
    expect(redactAmounts("Saldo -$ 1.200")).toBe(`Saldo ${HIDDEN_AMOUNT}`);
    expect(redactAmounts("pagó $45000")).toBe(`pagó ${HIDDEN_AMOUNT}`);
  });

  it("no toca texto sin montos", () => {
    expect(redactAmounts("Llamada de kickoff con Ana (3 cuotas)")).toBe("Llamada de kickoff con Ana (3 cuotas)");
    expect(redactAmounts(null)).toBeNull();
  });

  it("cobros y facturas son actividad de Finanzas", () => {
    expect(isFinanceActivity("cobro")).toBe(true);
    expect(isFinanceActivity("factura")).toBe(true);
    expect(isFinanceActivity("llamada")).toBe(false);
    expect(isFinanceActivity("sistema")).toBe(false);
  });
});
