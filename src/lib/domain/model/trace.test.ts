import { describe, expect, it } from "vitest";
import { decisionTraceSchema, type DecisionTrace } from "./trace";

const valid: DecisionTrace = {
    understood: "Ana quer saber como está o chamado do notebook.",
    intent: "ticket_lookup",
    confidence: 0.9,
    reasoning: "Único chamado dela sobre notebook.",
    actions: [
        {
            tool: "listMyTickets",
            label: "consultou seus chamados",
            status: "ok",
            summary: "3 chamados abertos",
            durationMs: 40,
        },
    ],
    rulesApplied: ["sla-overdue"],
    handoffReason: null,
    model: "qwen2.5:7b",
    latencyMs: 900,
    usage: { inputTokens: 300, outputTokens: 80, llmCalls: 2 },
};

describe("decisionTraceSchema", () => {
    it("rejeita token negativo no uso", () => {
        expect(
            decisionTraceSchema.safeParse({ ...valid, usage: { inputTokens: -1, outputTokens: 0, llmCalls: 1 } }).success,
        ).toBe(false);
    });
    it("aceita um trace válido", () => {
        expect(decisionTraceSchema.safeParse(valid).success).toBe(true);
    });

    it("rejeita confiança fora de 0 a 1", () => {
        expect(decisionTraceSchema.safeParse({ ...valid, confidence: 1.2 }).success).toBe(false);
        expect(decisionTraceSchema.safeParse({ ...valid, confidence: -0.1 }).success).toBe(false);
    });

    it("rejeita intenção desconhecida", () => {
        expect(decisionTraceSchema.safeParse({ ...valid, intent: "hackear" }).success).toBe(false);
    });

    it("rejeita duração negativa em uma ação", () => {
        const bad = { ...valid, actions: [{ ...valid.actions[0]!, durationMs: -1 }] };
        expect(decisionTraceSchema.safeParse(bad).success).toBe(false);
    });
});