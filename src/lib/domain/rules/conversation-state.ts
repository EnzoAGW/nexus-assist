import type { ConversationState } from "../model/enums";

const TRANSITIONS: Record<ConversationState, readonly ConversationState[]> = {
    with_agent: ["awaiting_analyst", "closed"],
    awaiting_analyst: ["with_analyst", "with_agent"], // assumir | devolver ao agent
    with_analyst: ["with_agent", "closed"], // devolver | encerrar
    closed: [],
};

export function canTransition(from: ConversationState, to: ConversationState): boolean {
    return TRANSITIONS[from].includes(to);
}

/** O agent só responde quando a conversa está com ele. */
export const agentMayReply = (state: ConversationState): boolean => state === "with_agent";

/** O analista só escreve depois de assumir. */
export const analystMayReply = (state: ConversationState): boolean => state === "with_analyst";