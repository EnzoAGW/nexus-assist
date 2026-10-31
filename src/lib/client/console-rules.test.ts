import { describe, expect, it } from "vitest";
import type { ConversationState } from "@/lib/domain/model/enums";
import { availableActions, consoleMode, describeUi, itemStatus, kindTone, pickFocusTicket } from "./console-rules";

const ME = "rafael.lima@nexo.com.br";
const OTHER = "marina.costa@nexo.com.br";
const subject = (state: ConversationState, assigned: string | null = null) => ({ state, assignedAnalystEmail: assigned });

describe("availableActions: a tela oferece exatamente o que o servidor aceita", () => {
    it("na fila: assumir ou devolver, nunca responder nem encerrar", () => {
        expect(availableActions(subject("awaiting_analyst"), ME)).toEqual({ claim: true, returnToAgent: true, close: false, reply: false });
    });

    it("assumida por mim: responder, devolver e encerrar", () => {
        expect(availableActions(subject("with_analyst", ME), ME)).toEqual({ claim: false, returnToAgent: true, close: true, reply: true });
    });

    it("assumida por outro analista: somente leitura", () => {
        expect(availableActions(subject("with_analyst", OTHER), ME)).toEqual({ claim: false, returnToAgent: false, close: false, reply: false });
    });

    it("com o agent ou encerrada: nada a fazer", () => {
        const none = { claim: false, returnToAgent: false, close: false, reply: false };
        expect(availableActions(subject("with_agent"), ME)).toEqual(none);
        expect(availableActions(subject("closed"), ME)).toEqual(none);
    });
});

describe("itemStatus", () => {
    const base = { handoffKind: null, handoffKindLabel: null, assignedAnalystName: null };

    it("na fila usa o motivo da transferência", () => {
        expect(itemStatus({ ...subject("awaiting_analyst"), ...base, handoffKind: "uncertain", handoffKindLabel: "Agent sem segurança" }, ME)).toEqual({ label: "Agent sem segurança", tone: "amber" });
        expect(itemStatus({ ...subject("awaiting_analyst"), ...base, handoffKind: "critical", handoffKindLabel: "Chamado crítico" }, ME).tone).toBe("red");
    });

    it("quem está com a conversa", () => {
        expect(itemStatus({ ...subject("with_analyst", ME), ...base }, ME).label).toBe("Com você");
        expect(itemStatus({ ...subject("with_analyst", OTHER), ...base, assignedAnalystName: "Marina Costa" }, ME).label).toBe("Com Marina Costa");
        expect(itemStatus({ ...subject("with_agent"), ...base }, ME).label).toBe("Com o agent");
    });

    it("consoleMode e kindTone", () => {
        expect(consoleMode(subject("with_analyst", OTHER), ME)).toBe("other");
        expect(kindTone("requested")).toBe("blue");
        expect(kindTone(null)).toBe("amber");
    });
});

describe("pickFocusTicket", () => {
    const t = (id: string, over: Partial<{ overdue: boolean; status: "open" | "resolved" }> = {}) => ({ id, overdue: false, status: "open" as const, ...over });
    const tickets = [t("INC-1001", { status: "resolved" }), t("INC-2002"), t("INC-3003", { overdue: true })];

    it("o chamado citado mais recentemente ganha", () => {
        expect(pickFocusTicket(tickets, ["resumo cita INC-3003", "depois fala do inc-2002"])?.id).toBe("INC-2002");
    });

    it("sem citação: o vencido; depois o primeiro ativo; depois o primeiro", () => {
        expect(pickFocusTicket(tickets, ["sem número"])?.id).toBe("INC-3003");
        expect(pickFocusTicket([t("INC-1001", { status: "resolved" }), t("INC-2002")], [])?.id).toBe("INC-2002");
        expect(pickFocusTicket([t("INC-1001", { status: "resolved" })], [])?.id).toBe("INC-1001");
        expect(pickFocusTicket([], [])).toBeNull();
    });

    it("ID citado que não é do funcionário é ignorado", () => {
        expect(pickFocusTicket(tickets, ["INC-9999"])?.id).toBe("INC-3003");
    });
});

describe("describeUi", () => {
    it("resume o que o agent exibiu", () => {
        expect(describeUi({ type: "ticket_card", ticketId: "INC-1" })).toBe("Mostrou o chamado INC-1");
        expect(describeUi({ type: "quick_replies", options: ["a", "b"] })).toBe("Ofereceu: a · b");
    });
});