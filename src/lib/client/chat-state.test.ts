import { describe, expect, it } from "vitest";
import type { MessageDto } from "@/server/serialize";
import { activeDraftMessageId, chatReducer, initialChatState, interactiveMessageId, type ChatAction, type ChatState } from "./chat-state";

const msg = (over: Partial<MessageDto> & Pick<MessageDto, "id" | "role">): MessageDto => ({
    content: "x", authorEmail: null, trace: null, ui: null, createdAt: "2026-10-28T15:00:00.000Z", ...over,
});
const run = (actions: ChatAction[], start: ChatState = { ...initialChatState, status: "ready" }) => actions.reduce(chatReducer, start);
const draftUi = { elements: [{ type: "update_draft", ticketId: "INC-1", note: "n", reopen: false }] };

describe("envio de mensagem", () => {
    it("mensagem otimista é trocada pela gravada, o texto acumula e a resposta final substitui o stream", () => {
        const s = run([
            { type: "send_started", tempId: "tmp-1", text: "oi", createdAt: "t" },
            { type: "user_message", message: msg({ id: "u1", role: "user", content: "oi" }) },
            { type: "text", delta: "Ol" },
            { type: "text", delta: "á" },
        ]);
        expect(s.messages.map((m) => m.id)).toEqual(["u1"]);
        expect(s.streaming?.text).toBe("Olá");

        const end = run([
            { type: "agent_message", message: msg({ id: "a1", role: "agent", content: "Olá!" }) },
            { type: "done", state: "with_agent", session: { used: 1, limit: 30 }, hasPendingAction: false },
        ], s);
        expect(end.streaming).toBeNull();
        expect(end.sending).toBe(false);
        expect(end.session.used).toBe(1);
        expect(end.messages.map((m) => m.id)).toEqual(["u1", "a1"]);
    });

    it("limite da sessão: remove a mensagem otimista e mostra o aviso", () => {
        const s = run([
            { type: "send_started", tempId: "tmp-1", text: "oi", createdAt: "t" },
            { type: "blocked", message: "Limite atingido", used: 30, limit: 30 },
        ]);
        expect(s.messages).toEqual([]);
        expect(s.notice).toBe("Limite atingido");
        expect(s.sending).toBe(false);
    });

    it("falha depois de a mensagem do funcionário ser gravada: ela fica na tela", () => {
        const s = run([
            { type: "send_started", tempId: "tmp-1", text: "oi", createdAt: "t" },
            { type: "user_message", message: msg({ id: "u1", role: "user" }) },
            { type: "send_failed", message: "conexão caiu" },
        ]);
        expect(s.messages.map((m) => m.id)).toEqual(["u1"]);
        expect(s.notice).toBe("conexão caiu");
    });

    it("falha antes de gravar: some a mensagem otimista", () => {
        const s = run([{ type: "send_started", tempId: "tmp-1", text: "oi", createdAt: "t" }, { type: "send_failed", message: "offline" }]);
        expect(s.messages).toEqual([]);
    });

    it("mensagem repetida não duplica", () => {
        const m = msg({ id: "a1", role: "agent" });
        expect(run([{ type: "agent_message", message: m }, { type: "agent_message", message: m }]).messages).toHaveLength(1);
    });
});

describe("consulta periódica (analista)", () => {
    const snapshot = { conversation: { id: "c", state: "with_analyst" as const, hasPendingAction: false, session: { used: 2, limit: 30 } }, messages: [msg({ id: "x", role: "analyst" })], tickets: null };

    it("aplica o estado novo, mas não interfere enquanto algo está sendo enviado", () => {
        expect(run([{ type: "synced", snapshot }]).conversationState).toBe("with_analyst");
        const busy = run([{ type: "send_started", tempId: "tmp-1", text: "oi", createdAt: "t" }, { type: "synced", snapshot }]);
        expect(busy.conversationState).toBe("with_agent");
    });

    it("chamados indisponíveis não apagam os que já estavam na tela", () => {
        const start: ChatState = { ...initialChatState, status: "ready", tickets: [] };
        expect(run([{ type: "synced", snapshot }], start).tickets).toEqual([]);
    });
});

describe("botões Confirmar e Cancelar", () => {
    it("resultado grava as duas mensagens e atualiza a pendência", () => {
        const s = run([
            { type: "button_started" },
            { type: "button_done", userMessage: msg({ id: "u", role: "user" }), agentMessage: msg({ id: "a", role: "agent" }), state: "awaiting_analyst", hasPendingAction: false },
        ]);
        expect(s.messages.map((m) => m.id)).toEqual(["u", "a"]);
        expect(s.conversationState).toBe("awaiting_analyst");
        expect(s.sending).toBe(false);
    });

    it("falha mostra o aviso e libera os botões", () => {
        const s = run([{ type: "button_started" }, { type: "button_failed", message: "instável" }]);
        expect(s).toMatchObject({ sending: false, notice: "instável" });
    });
});

describe("seletores", () => {
    const base: ChatState = { ...initialChatState, status: "ready", hasPendingAction: true };

    it("só o último rascunho, e só com ação pendente, fica ativo", () => {
        const messages = [msg({ id: "d1", role: "agent", ui: draftUi }), msg({ id: "d2", role: "agent", ui: draftUi })];
        expect(activeDraftMessageId({ ...base, messages })).toBe("d2");
        expect(activeDraftMessageId({ ...base, messages, hasPendingAction: false })).toBeNull();
        expect(activeDraftMessageId({ ...base, messages: [msg({ id: "a", role: "agent" })] })).toBeNull();
    });

    it("opções rápidas: só na última mensagem do agent, sem nada em andamento", () => {
        const messages = [msg({ id: "u", role: "user" }), msg({ id: "a", role: "agent" })];
        expect(interactiveMessageId({ ...base, messages })).toBe("a");
        expect(interactiveMessageId({ ...base, messages: [...messages, msg({ id: "u2", role: "user" })] })).toBeNull();
        expect(interactiveMessageId({ ...base, messages, sending: true })).toBeNull();
        expect(interactiveMessageId({ ...base, messages, streaming: { text: "x" } })).toBeNull();
        expect(interactiveMessageId({ ...base, messages, conversationState: "awaiting_analyst" })).toBeNull();
    });
});