import { describe, expect, it } from "vitest";
import { archivedChange } from "./archive";

describe("baja lógica", () => {
  it("sin el campo no cambia nada", () => {
    expect(archivedChange(null, undefined)).toBeNull();
    expect(archivedChange("2026-11-01T12:00:00.000Z", undefined)).toBeNull();
  });

  it("da de baja lo que está activo", () => {
    expect(archivedChange(null, true)).toBe("baja");
  });

  it("reactiva lo que está de baja", () => {
    expect(archivedChange("2026-11-01T12:00:00.000Z", false)).toBe("reactivado");
    expect(archivedChange(new Date(), false)).toBe("reactivado");
  });

  it("no pisa la fecha si ya estaba en ese estado", () => {
    expect(archivedChange("2026-11-01T12:00:00.000Z", true)).toBeNull();
    expect(archivedChange(null, false)).toBeNull();
  });
});
