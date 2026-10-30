import type { ConversationState } from "@/lib/domain/model/enums";
import { parseUi } from "@/lib/domain/model/ui";
import type { MessageDto, TicketDto } from "@/server/serialize";

export interface SessionInfo {
    used: number;
    limit: number;
}

/** O que `GET /api/chat` devolve. */
export interface ChatSnapshot {
    conversation: { id: string; state: ConversationState; hasPendingAction: boolean; session: SessionInfo };
    messages: MessageDto[];
    tickets: TicketDto[] | null;
}

export interface ChatState {
    status: "loading" | "ready" | "error";
    loadError: string | null;
    conversationState: ConversationState;
    hasPendingAction: boolean;
    session: SessionInfo;
    messages: MessageDto[];
    /** `null` = sistema de chamados indisponível agora; os cards mostram um aviso. */
    tickets: TicketDto[] | null;
    /** Resposta do agent chegando. */
    streaming: { text: string } | null;
    sending: boolean;
    notice: string | null;
}

export const initialChatState: ChatState = {
    status: "loading",
    loadError: null,
    conversationState: "with_agent",
    hasPendingAction: false,
    session: { used: 0, limit: 30 },
    messages: [],
    tickets: [],
    streaming: null,
    sending: false,
    notice: null,
};

export type ChatAction =
    | { type: "loaded"; snapshot: ChatSnapshot }
    | { type: "load_failed"; message: string }
    | { type: "synced"; snapshot: ChatSnapshot }
    | { type: "tickets"; tickets: TicketDto[] | null }
    | { type: "send_started"; tempId: string; text: string; createdAt: string }
    | { type: "user_message"; message: MessageDto }
    | { type: "text"; delta: string }
    | { type: "agent_message"; message: MessageDto }
    | { type: "blocked"; message: string; used: number; limit: number }
    | { type: "paused"; state: ConversationState }
    | { type: "done"; state: ConversationState; session: SessionInfo; hasPendingAction: boolean }
    | { type: "send_failed"; message: string }
    | { type: "button_started" }
    | { type: "button_done"; userMessage: MessageDto; agentMessage: MessageDto; state: ConversationState; hasPendingAction: boolean }
    | { type: "button_failed"; message: string }
    | { type: "dismiss_notice" };

const isOptimistic = (m: MessageDto) => m.id.startsWith("tmp-");
const withoutOptimistic = (messages: MessageDto[]) => messages.filter((m) => !isOptimistic(m));
const append = (messages: MessageDto[], message: MessageDto) =>
    messages.some((m) => m.id === message.id) ? messages : [...messages, message];

function fromSnapshot(state: ChatState, s: ChatSnapshot): ChatState {
    return {
        ...state,
        conversationState: s.conversation.state,
        hasPendingAction: s.conversation.hasPendingAction,
        session: s.conversation.session,
        messages: s.messages,
        // Chamados fora do ar não apagam o que já estava na tela.
        tickets: s.tickets ?? state.tickets,
    };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
    switch (action.type) {
        case "loaded":
            return { ...fromSnapshot(state, action.snapshot), status: "ready", loadError: null, streaming: null, sending: false, notice: null };

        case "load_failed":
            return { ...state, status: "error", loadError: action.message };

        case "synced":
            // Enquanto algo está sendo enviado ou respondido, a tela manda: a consulta periódica não interfere.
            return state.sending || state.streaming ? state : { ...fromSnapshot(state, action.snapshot), status: "ready" };

        case "tickets":
            return { ...state, tickets: action.tickets };

        case "send_started":
            return {
                ...state,
                sending: true,
                streaming: null,
                notice: null,
                messages: [
                    ...state.messages,
                    { id: action.tempId, role: "user", content: action.text, authorEmail: null, trace: null, ui: null, createdAt: action.createdAt },
                ],
            };

        case "user_message": {
            const i = state.messages.findIndex(isOptimistic);
            const messages = i >= 0 ? state.messages.map((m, idx) => (idx === i ? action.message : m)) : append(state.messages, action.message);
            return { ...state, messages };
        }

        case "text":
            return { ...state, streaming: { text: (state.streaming?.text ?? "") + action.delta } };

        case "agent_message":
            return { ...state, streaming: null, messages: append(state.messages, action.message) };

        case "blocked":
            return {
                ...state,
                sending: false,
                streaming: null,
                notice: action.message,
                session: { used: action.used, limit: action.limit },
                messages: withoutOptimistic(state.messages),
            };

        case "paused":
            return { ...state, conversationState: action.state };

        case "done":
            return {
                ...state,
                sending: false,
                streaming: null,
                conversationState: action.state,
                session: action.session,
                hasPendingAction: action.hasPendingAction,
            };

        case "send_failed":
            // Se a mensagem do funcionário já foi gravada, ela fica; só some a otimista.
            return { ...state, sending: false, streaming: null, notice: action.message, messages: withoutOptimistic(state.messages) };

        case "button_started":
            return { ...state, sending: true, notice: null };

        case "button_done":
            return {
                ...state,
                sending: false,
                conversationState: action.state,
                hasPendingAction: action.hasPendingAction,
                messages: append(append(state.messages, action.userMessage), action.agentMessage),
            };

        case "button_failed":
            return { ...state, sending: false, notice: action.message };

        case "dismiss_notice":
            return { ...state, notice: null };
    }
}

/** Só o ÚLTIMO rascunho, e só enquanto houver ação pendente, aceita Confirmar/Editar/Cancelar. */
export function activeDraftMessageId(state: ChatState): string | null {
    if (!state.hasPendingAction) return null;
    for (let i = state.messages.length - 1; i >= 0; i--) {
        const m = state.messages[i]!;
        if (m.role === "agent" && parseUi(m.ui).some((e) => e.type === "draft" || e.type === "update_draft")) return m.id;
    }
    return null;
}

/** Opções rápidas e seleção de chamado só valem na última mensagem, quando o agent é quem responde e nada está em andamento. */
export function interactiveMessageId(state: ChatState): string | null {
    if (state.sending || state.streaming || state.conversationState !== "with_agent") return null;
    const last = state.messages[state.messages.length - 1];
    return last?.role === "agent" ? last.id : null;
}