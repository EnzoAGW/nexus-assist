import { describe, expect, it } from "vitest";
import { derivePriority } from "./priority";

const base = { type: "INC", impact: "single", blocksWork: false, deadlineToday: false } as const;

describe("derivePriority", () => {
  it("crítica: parado para equipe ou empresa", () => {
    expect(derivePriority({ ...base, impact: "team", blocksWork: true }).priority).toBe("critical");
    expect(derivePriority({ ...base, impact: "company", blocksWork: true }).priority).toBe("critical");
  });

  it("alta: impede uma pessoa ou há compromisso no dia", () => {
    expect(derivePriority({ ...base, blocksWork: true }).priority).toBe("high");
    expect(derivePriority({ ...base, deadlineToday: true }).priority).toBe("high");
  });

  it("'não sei' não escala para crítica sozinho", () => {
    expect(derivePriority({ ...base, impact: "unknown", blocksWork: true }).priority).toBe("high");
  });

  it("média: incidente com alternativa", () => {
    expect(derivePriority(base).priority).toBe("medium");
  });

  it("baixa: requisição sem urgência", () => {
    expect(derivePriority({ ...base, type: "REQ" }).priority).toBe("low");
  });

  it("sempre explica o motivo", () => {
    expect(derivePriority(base).reason.length).toBeGreaterThan(0);
  });
});