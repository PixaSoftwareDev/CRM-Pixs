import { daySlots, firstOverlap, overlaps } from "@crm/shared";
import { describe, expect, it } from "vitest";
import { rangeOf, toBlocks } from "./availability";
import { toInstant } from "./time";

const h = (hhmm: string) => {
  const [hh = 0, mm = 0] = hhmm.split(":").map(Number);
  return hh * 60 + mm;
};
const block = (from: string, to: string, title = "Ocupado") => ({ start: h(from), end: h(to), title });
const startsOf = (slots: { start: number; blockedBy?: unknown }[], free: boolean) =>
  slots.filter((s) => !s.blockedBy === free).map((s) => s.start / 60);

describe("overlaps", () => {
  it("rangos que se tocan en el borde no se pisan", () => {
    expect(overlaps(h("10:00"), h("11:00"), h("11:00"), h("12:00"))).toBe(false);
    expect(overlaps(h("11:00"), h("12:00"), h("10:00"), h("11:00"))).toBe(false);
  });
  it("cualquier superposición, contención incluida, se pisa", () => {
    expect(overlaps(h("10:00"), h("11:00"), h("10:59"), h("12:00"))).toBe(true);
    expect(overlaps(h("09:00"), h("13:00"), h("10:00"), h("10:30"))).toBe(true);
    expect(overlaps(h("10:15"), h("10:20"), h("10:00"), h("11:00"))).toBe(true);
  });
});

describe("firstOverlap", () => {
  it("devuelve el que empieza antes", () => {
    const busy = [block("11:00", "12:00", "B"), block("10:00", "10:45", "A")];
    expect(firstOverlap(busy, h("10:30"), h("11:30"))?.title).toBe("A");
    expect(firstOverlap(busy, h("12:00"), h("13:00"))).toBeUndefined();
  });
});

describe("daySlots", () => {
  it("de 07:00 a 21:00 cada media hora, todo libre sin tareas", () => {
    const slots = daySlots([], { duration: 30 });
    expect(slots).toHaveLength(28);
    expect(slots[0]?.start).toBe(h("07:00"));
    expect(slots.at(-1)?.start).toBe(h("20:30"));
    expect(slots.every((s) => !s.blockedBy)).toBe(true);
  });

  it("marca ocupado el turno que se pisa con una tarea", () => {
    const busy = [block("10:00", "11:00")];
    const slots = daySlots(busy, { duration: 30, from: h("09:00"), to: h("12:00") });
    expect(startsOf(slots, false)).toEqual([10, 10.5]);
    expect(startsOf(slots, true)).toEqual([9, 9.5, 11, 11.5]);
  });

  it("una tarea de 1 h no entra en una media hora libre seguida de una ocupada", () => {
    const busy = [block("10:30", "11:00", "Llamada")];
    const slots = daySlots(busy, { duration: 60, from: h("09:00"), to: h("12:00") });
    expect(startsOf(slots, false)).toEqual([10, 10.5]);
    expect(slots.find((s) => s.start === h("10:00"))?.blockedBy?.title).toBe("Llamada");
    expect(startsOf(slots, true)).toEqual([9, 9.5, 11, 11.5]);
  });

  it("una tarea corrida (10:10–10:40) bloquea los dos turnos que toca", () => {
    const slots = daySlots([block("10:10", "10:40")], { duration: 30, from: h("10:00"), to: h("11:30") });
    expect(startsOf(slots, false)).toEqual([10, 10.5]);
  });

  it("hoy no ofrece los turnos que ya pasaron", () => {
    const slots = daySlots([], { duration: 30, notBefore: h("15:10") });
    expect(slots[0]?.start).toBe(h("15:30"));
  });

  it("todo ocupado: no queda ningún turno libre", () => {
    const slots = daySlots([block("00:00", "23:59")], { duration: 30 });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.blockedBy)).toBe(true);
  });
});

describe("toBlocks", () => {
  it("pasa los instantes a minutos del día de Argentina (lo de ayer empieza en negativo)", () => {
    const [today, fromYesterday] = toBlocks("2026-11-18", [
      { id: "a", title: "Reunión", startsAt: toInstant("2026-11-18", "10:00"), endsAt: toInstant("2026-11-18", "11:30") },
      { id: "b", title: "Guardia", startsAt: toInstant("2026-11-17", "23:00"), endsAt: toInstant("2026-11-18", "01:00") },
    ]);
    expect(today).toMatchObject({ start: h("10:00"), end: h("11:30"), range: "10:00–11:30" });
    expect(fromYesterday).toMatchObject({ start: -60, end: 60, range: "23:00–01:00" });
  });
});

describe("rangeOf", () => {
  it("rango del horario cargado; pasada la medianoche sigue al día siguiente", () => {
    expect(rangeOf("10:00", "11:00")).toEqual({ start: 600, end: 660 });
    expect(rangeOf("23:00", "01:00")).toEqual({ start: h("23:00"), end: h("23:00") + 120 });
    expect(rangeOf("10:00", "10:00")).toBeNull();
    expect(rangeOf("10:", "11:00")).toBeNull();
  });
});
