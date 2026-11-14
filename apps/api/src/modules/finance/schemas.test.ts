import { installmentPlanCreate, paymentCreate, todayInArgentina } from "@crm/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

const pay = (receivedOn: string) => paymentCreate.safeParse({ amount: 100, method: "efectivo", receivedOn });

describe("fechas de cobros y gastos", () => {
  afterEach(() => vi.useRealTimers());

  it("hoy es el día de Argentina, no el de UTC", () => {
    expect(todayInArgentina(new Date("2026-11-15T02:30:00Z"))).toBe("2026-11-14");
    expect(todayInArgentina(new Date("2026-11-15T03:00:00Z"))).toBe("2026-11-15");
  });

  it("no acepta un cobro con fecha de mañana (en Argentina)", () => {
    // 23:30 del 14 en Argentina = 02:30 del 15 en UTC: el 15 todavía es futuro.
    vi.useFakeTimers({ now: new Date("2026-11-15T02:30:00Z") });
    expect(pay("2026-11-14").success).toBe(true);
    expect(pay("2026-11-15").success).toBe(false);
    // Al mediodía: mañana tampoco (antes se permitía hoy UTC + 1 día).
    vi.setSystemTime(new Date("2026-11-14T15:00:00Z"));
    expect(pay("2026-11-15").success).toBe(false);
    expect(pay("2026-11-14").success).toBe(true);
  });
});

describe("plan de cuotas", () => {
  const items = [
    { number: 0, amount: 30_000_00, dueOn: "2026-11-14" },
    { number: 1, amount: 70_000_00, dueOn: "2026-12-10" },
  ];

  it("acepta un plan que cierra", () => {
    expect(installmentPlanCreate.safeParse({ description: "30% + 1", total: 100_000_00, advancePercent: 30, items }).success).toBe(true);
    // Sin total ni porcentaje (clientes viejos de la API) sigue funcionando.
    expect(installmentPlanCreate.safeParse({ description: "x", items }).success).toBe(true);
  });

  it("rechaza anticipo fuera de 0–100%", () => {
    const r = installmentPlanCreate.safeParse({
      description: "150%",
      total: 100_000_00,
      advancePercent: 150,
      items: [{ number: 0, amount: 150_000_00, dueOn: "2026-11-14" }],
    });
    expect(r.success).toBe(false);
  });

  it("rechaza cuotas que no suman el total o un anticipo que no es el porcentaje", () => {
    expect(installmentPlanCreate.safeParse({ description: "x", total: 90_000_00, items }).success).toBe(false);
    expect(installmentPlanCreate.safeParse({ description: "x", total: 100_000_00, advancePercent: 50, items }).success).toBe(false);
  });
});
