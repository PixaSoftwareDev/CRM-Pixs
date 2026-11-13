import { describe, expect, it } from "vitest";
import { fmtWhen, hourAr, nextWorkdayAt, todayArIso } from "./dates";

describe("fechas en Argentina", () => {
  it("el día cambia a medianoche de Argentina, no de UTC", () => {
    expect(todayArIso(new Date("2026-11-14T02:30:00Z"))).toBe("2026-11-13");
    expect(hourAr(new Date("2026-11-14T02:30:00Z"))).toBe(23);
  });

  it("próximo día hábil saltea el fin de semana", () => {
    // viernes 13 → lunes 16
    expect(nextWorkdayAt("10:00", new Date("2026-11-13T15:00:00Z")).toISOString()).toBe("2026-11-16T13:00:00.000Z");
    // martes 10 → miércoles 11
    expect(nextWorkdayAt("10:00", new Date("2026-11-10T15:00:00Z")).toISOString()).toBe("2026-11-11T13:00:00.000Z");
  });

  it("formato corto legible", () => {
    expect(fmtWhen("2026-11-16T13:00:00.000Z")).toBe("lun 16/11 10:00");
  });
});
