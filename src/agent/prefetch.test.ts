import { describe, expect, it } from "vitest";
import { planPrefetch, renderContext } from "./prefetch";

describe("planPrefetch", () => {
    it("dúvida: só a central de ajuda", () => {
        expect(planPrefetch("faq", "horário do service desk", "x")).toEqual([{ kind: "kb", query: "horário do service desk" }]);
    });

    it("abrir chamado: central e chamados, sem exibir a lista (consulta só para o modelo)", () => {
        expect(planPrefetch("ticket_create", "meu teclado quebrou", "Teclado quebrado")).toEqual([
            { kind: "kb", query: "meu teclado quebrou Teclado quebrado" },
            { kind: "list", showCards: false },
        ]);
    });

    it("citou o número: busca esse chamado; senão, lista visível para escolher", () => {
        expect(planPrefetch("ticket_lookup", "INC-20311 · Notebook lento", "x")).toEqual([{ kind: "get", ticketId: "INC-20311" }]);
        expect(planPrefetch("ticket_update", "como está o inc-20311?", "x")).toEqual([{ kind: "get", ticketId: "INC-20311" }]);
        expect(planPrefetch("ticket_lookup", "como está meu chamado?", "x")).toEqual([{ kind: "list", showCards: true }]);
    });

    it("com vários números, usa só o primeiro", () => {
        expect(planPrefetch("ticket_lookup", "INC-20311 e INC-20150", "x")).toEqual([{ kind: "get", ticketId: "INC-20311" }]);
    });

    it("conversa, fora de escopo e transferência não consultam nada", () => {
        for (const intent of ["smalltalk", "out_of_scope", "handoff_request", "clarification"] as const) {
            expect(planPrefetch(intent, "oi", "x")).toEqual([]);
        }
    });
});

describe("renderContext", () => {
    it("rotula cada consulta e limita o tamanho", () => {
        const text = renderContext([{ step: { kind: "list", showCards: false }, result: { count: 1 } }]);
        expect(text).toBe('Chamados do funcionário: {"count":1}');
        expect(renderContext([{ step: { kind: "kb", query: "x" }, result: { big: "a".repeat(10_000) } }]).length).toBeLessThanOrEqual(3500);
    });
});