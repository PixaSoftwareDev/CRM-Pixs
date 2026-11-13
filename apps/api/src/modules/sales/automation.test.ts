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
