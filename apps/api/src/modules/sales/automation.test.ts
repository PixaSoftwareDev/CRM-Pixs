import { describe, expect, it } from "vitest";
import { ruleFor } from "./automation";

describe("reglas del embudo", () => {
  it("llamada hecha → primer contacto", () => {
    expect(ruleFor("done", "Llamada", undefined)?.to).toBe("primer_contacto");
  });

  it("reunión agendada o hecha → reunión", () => {
    expect(ruleFor("scheduled", "Reunión", undefined)?.to).toBe("reunion");
    expect(ruleFor("done", "Reunión", undefined)?.to).toBe("reunion");
  });

  it("ventas hecha → propuesta; si el comentario dice que aceptó → cierre", () => {
    expect(ruleFor("done", "Ventas", "le mandé la propuesta")?.to).toBe("propuesta");
    expect(ruleFor("done", "Ventas", "Aceptó el presupuesto")?.to).toBe("cierre");
    expect(ruleFor("done", "Ventas", "aceptaron, firman el lunes")?.to).toBe("cierre");
  });

  it("una negación no cuenta como aceptación", () => {
    expect(ruleFor("done", "Ventas", "El cliente NO aceptó la propuesta")?.to).toBe("propuesta");
    expect(ruleFor("done", "Ventas", "todavía no la aceptaron")?.to).toBe("propuesta");
    expect(ruleFor("done", "Ventas", "nunca lo aceptó")?.to).toBe("propuesta");
    expect(ruleFor("done", "Ventas", "dudaba pero al final aceptó")?.to).toBe("cierre");
  });

  it("cuentan los comentarios ya guardados: manda el último que habla de aceptar", () => {
    expect(ruleFor("done", "Ventas", ["Le mandé la propuesta", "Aceptó, firma el lunes", "Estado: Pendiente → Finalizada."])?.to).toBe("cierre");
    expect(ruleFor("done", "Ventas", ["Aceptó el presupuesto", "Al final no la aceptó"])?.to).toBe("propuesta");
    expect(ruleFor("done", "Ventas", ["no aceptó todavía", "ahora sí aceptó"])?.to).toBe("cierre");
    expect(ruleFor("done", "Ventas", [])?.to).toBe("propuesta");
  });

  it("cualquier tarea en curso solo pasa a seguimiento desde propuesta", () => {
    expect(ruleFor("in_progress", "Llamada", undefined)).toEqual(
      expect.objectContaining({ to: "seguimiento", onlyFrom: "propuesta" }),
    );
  });

  it("lo demás no mueve el embudo", () => {
    expect(ruleFor("scheduled", "Llamada", undefined)).toBeNull();
    expect(ruleFor("done", "Cobranza", undefined)).toBeNull();
    expect(ruleFor("done", "Falla", "aceptó")).toBeNull();
  });
});
