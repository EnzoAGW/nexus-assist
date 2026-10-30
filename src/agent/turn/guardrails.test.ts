import { describe, expect, it } from "vitest";
import { CONFIDENCE_THRESHOLD, routeMessage } from "./guardrails";
import type { Classification } from "../llm/classification";

const base: Classification = { intent: "ticket_lookup", understood: "x", confidence: 0.9, reasoning: "y" };
const route = (over: Partial<Classification> = {}, hasPendingAction = false) =>
  routeMessage({ ...base, ...over }, { hasPendingAction });

describe("routeMessage", () => {
  it("baixa confiança transfere para um analista, qualquer que seja a intenção", () => {
    const r = route({ intent: "faq", confidence: CONFIDENCE_THRESHOLD - 0.01 });
    expect(r).toMatchObject({ kind: "handoff", ruleId: "low-confidence" });
  });

  it("pedido de analista transfere", () => {
    expect(route({ intent: "handoff_request" })).toMatchObject({ kind: "handoff", ruleId: "user-requested-handoff" });
  });

  it("fora de escopo é redirecionado sem chamar o modelo principal", () => {
    expect(route({ intent: "out_of_scope" })).toEqual({ kind: "out_of_scope" });
  });

  it("o modelo só recebe as ferramentas da intenção", () => {
    expect(route({ intent: "faq" })).toEqual({ kind: "agent", toolset: [] });
    const create = route({ intent: "ticket_create" });
    expect(create.kind === "agent" && create.toolset).toContain("proposeTicket");
    expect(create.kind === "agent" && create.toolset).not.toContain("proposeTicketUpdate");
  });

  it("consulta nunca expõe ferramentas de escrita", () => {
    const r = route({ intent: "ticket_lookup" });
    expect(r.kind === "agent" && r.toolset).not.toContain("proposeTicket");
    expect(r.kind === "agent" && r.toolset).not.toContain("proposeTicketUpdate");
  });

  it("confirmação digitada: só com rascunho pendente e confiança alta", () => {
    expect(route({ intent: "confirmation", confidence: 0.9 }, true)).toEqual({ kind: "confirm" });
    expect(route({ intent: "confirmation", confidence: 0.7 }, true)).toEqual({ kind: "use_buttons" });
    expect(route({ intent: "confirmation", confidence: 0.95 }, false)).toMatchObject({ kind: "agent" });
  });
});