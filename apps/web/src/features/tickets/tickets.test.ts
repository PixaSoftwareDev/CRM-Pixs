import { describe, expect, it } from "vitest";
import { confirmSlots, validDue } from "./dates";

describe("validDue", () => {
  it("solo acepta fechas completas y razonables", () => {
    expect(validDue("2026-12-25")).toBe(true);
    expect(validDue("0002-12-25")).toBe(false); // a medio tipear el año
    expect(validDue("2026-02-30")).toBe(false);
    expect(validDue("")).toBe(false);
  });
});

describe("confirmSlots", () => {
  it("ofrece hoy en dos horas si entra antes de las 19", () => {
    const slots = confirmSlots(10 * 60 + 5, "2026-11-13");
    expect(slots.map((s) => s.label)).toEqual(["Hoy 12:15", "Mañana 10:00", "Pasado mañana 10:00"]);
    expect(slots[1]?.at).toBe("2026-11-14T13:00:00.000Z");
  });

  it("de noche no ofrece un horario de hoy que ya pasó", () => {
    expect(confirmSlots(20 * 60, "2026-11-13").map((s) => s.label)).toEqual(["Mañana 10:00", "Pasado mañana 10:00"]);
    expect(confirmSlots(17 * 60 + 1, "2026-11-13")[0]?.label).toBe("Mañana 10:00");
  });
});
