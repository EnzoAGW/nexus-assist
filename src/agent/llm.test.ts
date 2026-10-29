import { describe, expect, it } from "vitest";
import { addUsage, isLlmUnavailable } from "./llm";

describe("isLlmUnavailable", () => {
    it("cota (429) e erro do provedor (5xx) são indisponibilidade", () => {
        expect(isLlmUnavailable({ statusCode: 429 })).toBe(true);
        expect(isLlmUnavailable({ statusCode: 503 })).toBe(true);
    });

    it("falha de rede, mesmo aninhada em cause", () => {
        expect(isLlmUnavailable(new Error("x", { cause: { code: "ECONNREFUSED" } }))).toBe(true);
    });

    it("erro de configuração (400, 401, 404) NÃO é indisponibilidade: é bug nosso", () => {
        expect(isLlmUnavailable({ statusCode: 400 })).toBe(false);
        expect(isLlmUnavailable({ statusCode: 401 })).toBe(false);
        expect(isLlmUnavailable({ statusCode: 404 })).toBe(false);
        expect(isLlmUnavailable(new Error("boom"))).toBe(false);
    });
});

describe("addUsage", () => {
    it("soma tokens e chamadas", () => {
        expect(
            addUsage({ inputTokens: 10, outputTokens: 5, calls: 1 }, { inputTokens: 20, outputTokens: 7, calls: 1 }),
        ).toEqual({ inputTokens: 30, outputTokens: 12, calls: 2 });
    });
});