import { describe, expect, it } from "vitest";
import { layoutLanes } from "./lanes";
import { cleanTitle, parseQuickTask } from "./quick-parse";
import { addDays, arParts, monthGrid, shiftEnd, toInstant, weekStart, weekTitle } from "./time";

const clients = [
  { id: "espiga", name: "Panadería La Espiga" },
  { id: "ruiz", name: "Estudio Ruiz & Asoc." },
  { id: "fitzone", name: "Gimnasio FitZone" },
  { id: "sol", name: "Clínica del Sol" },
];
const opts = { clients, baseDate: "2026-11-13", defaultStart: "16:00" }; // viernes

describe("parseQuickTask", () => {
  it("saca cliente, tipo y hora", () => {
    const d = parseQuickTask("llamar a La Espiga por la cuota 10hs", opts);
    expect(d).toMatchObject({ clientId: "espiga", typeName: "Cobranza", date: "2026-11-13", start: "10:00", durationMinutes: 30 });
    expect(d.title).toBe("Llamar a La Espiga por la cuota");
  });

  it("entiende mañana, días de la semana y fechas", () => {
    expect(parseQuickTask("reunión con fitzone mañana a las 9:30", opts)).toMatchObject({ clientId: "fitzone", typeName: "Reunión", date: "2026-11-14", start: "09:30", durationMinutes: 60 });
    expect(parseQuickTask("propuesta para clinica del sol el lunes", opts)).toMatchObject({ clientId: "sol", typeName: "Ventas", date: "2026-11-16" });
    expect(parseQuickTask("demo el viernes", opts).date).toBe("2026-11-20");
    expect(parseQuickTask("llamar para el martes", opts).date).toBe("2026-11-17");
    // Un día mencionado de pasada en la descripción no cambia la fecha.
    expect(parseQuickTask("ver como le fue con la prueba del martes", opts).date).toBe("2026-11-13");
    expect(parseQuickTask("cobrar a ruiz el 2/12 15.30 hs", opts)).toMatchObject({ clientId: "ruiz", date: "2026-12-02", start: "15:30" });
  });

  it("de 1 a 7 sin aclarar es de la tarde; la mañana se respeta", () => {
    expect(parseQuickTask("llamar a ruiz a las 3", opts).start).toBe("15:00");
    expect(parseQuickTask("llamar a ruiz 7hs", opts).start).toBe("19:00");
    expect(parseQuickTask("llamar a ruiz a las 7 de la mañana", opts).start).toBe("07:00");
    expect(parseQuickTask("llamar a ruiz a las 8", opts).start).toBe("08:00");
    expect(parseQuickTask("llamar a ruiz a las 9 de la noche", opts).start).toBe("21:00");
    expect(parseQuickTask("llamar a ruiz 15hs", opts).start).toBe("15:00");
  });

  it("\"por la mañana\" es un horario, no el día siguiente", () => {
    expect(parseQuickTask("llamar a ruiz por la mañana", opts).date).toBe("2026-11-13");
    expect(parseQuickTask("visita a fitzone a la mañana", opts).date).toBe("2026-11-13");
    expect(parseQuickTask("llamar a ruiz mañana por la mañana", opts).date).toBe("2026-11-14");
  });

  it("una fecha que no existe no se agenda en otro día: avisa", () => {
    const d = parseQuickTask("cobrar a ruiz el 31/11", opts);
    expect(d.date).toBe("2026-11-13");
    expect(d.warning).toMatch(/31\/11 no existe/);
    expect(parseQuickTask("cobrar a ruiz el 30/11", opts)).toMatchObject({ date: "2026-11-30", warning: null });
  });

  it("sin pistas usa los valores por defecto", () => {
    expect(parseQuickTask("ordenar el escritorio", opts)).toMatchObject({ clientId: null, typeName: null, date: "2026-11-13", start: "16:00" });
  });

  it("no confunde palabras genéricas del nombre con un cliente", () => {
    expect(parseQuickTask("pasar por la panaderia", opts).clientId).toBeNull();
  });
});

describe("layoutLanes", () => {
  it("reparte el ancho solo entre los que se pisan", () => {
    const placed = layoutLanes([
      { id: "a", start: 540, end: 660 },
      { id: "b", start: 600, end: 690 },
      { id: "c", start: 700, end: 760 },
    ]);
    const by = Object.fromEntries(placed.map((p) => [p.item.id, [p.lane, p.lanes]]));
    expect(by).toEqual({ a: [0, 2], b: [1, 2], c: [0, 1] });
  });

  it("reusa un carril que quedó libre dentro del mismo grupo", () => {
    const placed = layoutLanes([
      { id: "a", start: 0, end: 120 },
      { id: "b", start: 0, end: 30 },
      { id: "c", start: 60, end: 90 },
    ]);
    const by = Object.fromEntries(placed.map((p) => [p.item.id, [p.lane, p.lanes]]));
    expect(by).toEqual({ a: [0, 2], b: [1, 2], c: [1, 2] });
  });
});

describe("time", () => {
  it("convierte entre hora argentina e instante", () => {
    expect(toInstant("2026-11-13", "09:00")).toBe("2026-11-13T12:00:00.000Z");
    expect(arParts("2026-11-14T02:30:00.000Z")).toEqual({ date: "2026-11-13", time: "23:30", minutes: 1410 });
  });

  it("calcula semanas y meses", () => {
    expect(weekStart("2026-11-13")).toBe("2026-11-09");
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
    expect(weekStart("2026-11-15")).toBe("2026-11-09");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekTitle("2026-11-30")).toBe("30 de noviembre – 6 de diciembre 2026");
    const grid = monthGrid("2026-11-13");
    expect(grid[0]).toBe("2026-10-26");
    expect(grid.length % 7).toBe(0);
    expect(grid.at(-1)).toBe("2026-12-06");
  });
});

describe("cleanTitle", () => {
  it("saca del título el día y la hora (ya quedan en la agenda)", () => {
    expect(cleanTitle("Llamar a QA-Cliente hoy 16hs por seguimiento de propuesta")).toBe("Llamar a QA-Cliente por seguimiento de propuesta");
    expect(cleanTitle("cobrar a ruiz el 2/12 15.30 hs")).toBe("cobrar a ruiz");
    expect(cleanTitle("reunión con fitzone mañana a las 9:30")).toBe("reunión con fitzone");
    expect(cleanTitle("propuesta para clinica del sol el lunes")).toBe("propuesta para clinica del sol");
    expect(cleanTitle("llamar a ruiz a las 7 de la mañana")).toBe("llamar a ruiz");
    expect(cleanTitle("revisar el sábado que viene")).toBe("revisar");
  });
  it("no toca lo que no es fecha y no deja el título vacío", () => {
    expect(cleanTitle("Mañana")).toBe("Mañana");
    expect(cleanTitle("Revisar la mañana de capacitación")).toBe("Revisar la mañana de capacitación");
  });
});

describe("shiftEnd", () => {
  it("conserva la duración al mover el desde", () => {
    expect(shiftEnd("15:00", "15:30", "09:30")).toBe("10:00");
    expect(shiftEnd("10:00", "11:30", "14:15")).toBe("15:45");
  });

  it("sin duración válida queda en 1 hora", () => {
    expect(shiftEnd("", "", "09:30")).toBe("10:30");
    expect(shiftEnd("10:00", "", "09:30")).toBe("10:30");
    expect(shiftEnd("10:00", "10:00", "09:30")).toBe("10:30");
  });

  it("cruza la medianoche como el resto de la agenda", () => {
    expect(shiftEnd("22:00", "01:00", "23:00")).toBe("02:00");
    expect(shiftEnd("10:00", "11:00", "23:30")).toBe("00:30");
  });

  it("con el desde incompleto no toca el hasta", () => {
    expect(shiftEnd("10:00", "11:00", "")).toBe("11:00");
  });
});
