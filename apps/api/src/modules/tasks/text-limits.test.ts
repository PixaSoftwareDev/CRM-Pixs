import { activityCreate, BODY_MAX, taskCommentCreate, taskCreate, taskTitle, TITLE_MAX, ticketCancel, ticketCreate, ticketNote } from "@crm/shared";
import { describe, expect, it } from "vitest";

const uuid = "0190b8f0-0000-7000-8000-000000000000";

describe("textos libres sin límite práctico", () => {
  it("acepta títulos y comentarios muy largos", () => {
    const longTitle = "x".repeat(5_000);
    const longBody = "y".repeat(50_000);
    expect(taskTitle.safeParse(longTitle).success).toBe(true);
    expect(taskCreate.safeParse({ title: longTitle, typeId: uuid }).success).toBe(true);
    expect(taskCommentCreate.safeParse({ body: longBody }).success).toBe(true);
    expect(ticketNote.safeParse({ body: longBody }).success).toBe(true);
    expect(ticketCancel.safeParse({ reason: longBody }).success).toBe(true);
    expect(activityCreate.safeParse({ kind: "nota", body: longBody }).success).toBe(true);
    expect(
      ticketCreate.safeParse({ clientId: uuid, type: "falla", channel: "telefono", title: longTitle, description: longBody }).success,
    ).toBe(true);
  });

  it("el tope de seguridad avisa en castellano", () => {
    const title = taskTitle.safeParse("x".repeat(TITLE_MAX + 1));
    expect(title.success).toBe(false);
    expect(title.error?.issues[0]?.message).toMatch(/demasiado largo/);
    const body = taskCommentCreate.safeParse({ body: "y".repeat(BODY_MAX + 1) });
    expect(body.error?.issues[0]?.message).toMatch(/demasiado largo/);
  });

  it("sigue exigiendo que no esté vacío", () => {
    expect(taskTitle.safeParse("   ").success).toBe(false);
    expect(taskCommentCreate.safeParse({ body: " " }).success).toBe(false);
  });
});
