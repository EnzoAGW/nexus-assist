import { describe, expect, it } from "vitest";
import { buildHandoffSummary, toChatHistory } from "./history";

describe("toChatHistory", () => {
    it("mapeia papéis e descarta notas de sistema", () => {
        expect(
            toChatHistory([
                { role: "user", content: "oi" },
                { role: "system", content: "Conversa transferida" },
                { role: "analyst", content: "Olá, sou o Rafael" },
                { role: "agent", content: "Posso ajudar?" },
            ]),
        ).toEqual([
            { role: "user", content: "oi" },
            { role: "assistant", content: "[Analista] Olá, sou o Rafael" },
            { role: "assistant", content: "Posso ajudar?" },
        ]);
    });
});

describe("buildHandoffSummary", () => {
    it("usa só as 3 últimas mensagens do funcionário e limita o tamanho", () => {
        const history = ["a", "b", "c", "d"].map((content) => ({ role: "user" as const, content }));
        const summary = buildHandoffSummary(history, "Quer falar com alguém.");
        expect(summary).toContain('"b" | "c" | "d"');
        expect(summary).not.toContain('"a"');
        expect(buildHandoffSummary([{ role: "user", content: "x".repeat(500) }], "u").length).toBeLessThan(300);
    });
});