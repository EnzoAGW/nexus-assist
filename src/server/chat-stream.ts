import { runTurn, type RunTurnDeps, type RunTurnInput, type TurnEvent } from "@/agent/run-turn";
import type { SseEvent } from "@/lib/sse";
import { toMessageDto } from "./serialize";

export type ChatStreamDeps = RunTurnDeps & { maxMessages: number };

export function toSseEvent(ev: TurnEvent, maxMessages: number): SseEvent {
    switch (ev.type) {
        case "user_message":
            return { event: "user_message", data: toMessageDto(ev.message) };
        case "text":
            return { event: "text", data: { delta: ev.delta } };
        case "agent_message":
            // Conteúdo, trace e UI oficiais (já gravados): o cliente troca o texto transmitido por esta mensagem.
            return { event: "agent_message", data: toMessageDto(ev.message) };
        case "blocked":
            return {
                event: "blocked",
                data: {
                    used: ev.used,
                    limit: ev.limit,
                    message: `Você atingiu o limite de ${maxMessages} mensagens desta sessão. Saia e entre de novo para continuar, ou peça um analista.`,
                },
            };
        case "paused":
            return { event: "paused", data: { state: ev.state } };
    }
}

/** Eventos do turno mais um `done` final com o estado atual (para a UI atualizar contador e banner). */
export async function* chatEvents(deps: ChatStreamDeps, input: RunTurnInput): AsyncGenerator<SseEvent> {
    for await (const ev of runTurn(deps, input)) yield toSseEvent(ev, deps.maxMessages);

    const conv = await deps.services.conversations.getForUser(input.userEmail, input.conversationId);
    yield {
        event: "done",
        data: {
            state: conv?.state ?? "with_agent",
            session: { used: conv?.sessionMessageCount ?? 0, limit: deps.maxMessages },
            hasPendingAction: conv?.pendingAction != null,
        },
    };
}