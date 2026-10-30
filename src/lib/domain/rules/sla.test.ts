import { describe, expect, it } from "vitest";
import { computeDueAt, isOverdue } from "./sla";

const br = (s: string) => new Date(`${s}:00-03:00`);

describe("computeDueAt", () => {
  it("crítica: 1 hora corrida, inclusive fora do expediente", () => {
    expect(computeDueAt("critical", br("2026-10-31T10:00"))).toEqual(br("2026-10-31T11:00"));
  });

  it("alta: 4 horas úteis", () => {
    expect(computeDueAt("high", br("2026-10-26T16:00"))).toEqual(br("2026-10-27T10:00"));
  });

  it("média: 3 dias úteis", () => {
    expect(computeDueAt("medium", br("2026-10-26T10:00"))).toEqual(br("2026-10-29T10:00"));
  });

  it("baixa: 5 dias úteis", () => {
    expect(computeDueAt("low", br("2026-10-26T10:00"))).toEqual(br("2026-11-02T10:00"));
  });
});

describe("isOverdue", () => {
  const medium = { priority: "medium", status: "open", lastUpdatedAt: br("2026-10-26T10:00") } as const;

  it("não vence no instante exato do prazo", () => {
    expect(isOverdue(medium, br("2026-10-29T10:00"))).toBe(false);
  });

  it("vence depois do prazo", () => {
    expect(isOverdue(medium, br("2026-10-29T10:01"))).toBe(true);
  });

  it("resolvido ou encerrado nunca está vencido", () => {
    expect(isOverdue({ ...medium, status: "resolved" }, br("2026-12-01T10:00"))).toBe(false);
    expect(isOverdue({ ...medium, status: "closed" }, br("2026-12-01T10:00"))).toBe(false);
  });

  it("aguardando analista continua contando", () => {
    expect(isOverdue({ ...medium, status: "awaiting_analyst" }, br("2026-11-05T10:00"))).toBe(true);
  });
});