import type { Dispatch } from "react";
import type { ConversationState } from "@/lib/domain/model/enums";
import type { MessageDto, TicketDto } from "@/server/serialize";
import type { ChatAction, ChatSnapshot, SessionInfo } from "./chat-state";
import { readSse } from "./sse";

export class SessionExpiredError extends Error {
    constructor() {
        super("Sessão expirada.");
        this.name = "SessionExpiredError";
    }
}

const GENERIC = "Algo deu errado. Tente novamente.";
const NETWORK = "Não consegui conectar. Verifique sua conexão e tente de novo.";
const EXPIRED = "Sua sessão expirou. Entre de novo.";

async function errorMessage(res: Response): Promise<string> {
    const body = (await res.json().catch(() => null)) as { error?: { message?: unknown } } | null;
    return typeof body?.error?.message === "string" ? body.error.message : GENERIC;
}

export async function fetchSnapshot(fetchImpl: typeof fetch = fetch): Promise<ChatSnapshot> {
    const res = await fetchImpl("/api/chat", { cache: "no-store" });
    if (res.status === 401) throw new SessionExpiredError();
    if (!res.ok) throw new Error(await errorMessage(res));
    return (await res.json()) as ChatSnapshot;
}

/** `null` = sistema de chamados indisponível agora (a tela mostra um aviso nos cards). */
export async function fetchTickets(fetchImpl: typeof fetch = fetch): Promise<TicketDto[] | null> {
    const res = await fetchImpl("/api/tickets", { cache: "no-store" });
    if (res.status === 503) return null;
    if (res.status === 401) throw new SessionExpiredError();
    if (!res.ok) throw new Error(await errorMessage(res));
    return ((await res.json()) as { tickets: TicketDto[] }).tickets;
}

type Schedule = (callback: () => void) => void;
const defaultSchedule: Schedule = (cb) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(cb);
    else setTimeout(cb, 16);
};

/** Agrupa os pedaços de texto: ~80 eventos por resposta viram uma atualização por frame. */
export function createFrameBatcher(onFlush: (text: string) => void, schedule: Schedule = defaultSchedule) {
    let buffer = "";
    let scheduled = false;
    const flush = () => {
        scheduled = false;
        if (!buffer) return;
        const text = buffer;
        buffer = "";
        onFlush(text);
    };
    return {
        push(text: string) {
            buffer += text;
            if (!scheduled) {
                scheduled = true;
                schedule(flush);
            }
        },
        flush,
    };
}

export interface SendDeps {
    dispatch: Dispatch<ChatAction>;
    fetchImpl?: typeof fetch;
    schedule?: Schedule;
    now?: () => Date;
    newId?: () => string;
}

export async function sendMessage(text: string, deps: SendDeps): Promise<"ok" | "failed"> {
    const { dispatch, fetchImpl = fetch } = deps;
    const tempId = `tmp-${(deps.newId ?? (() => crypto.randomUUID()))()}`;
    dispatch({ type: "send_started", tempId, text, createdAt: (deps.now ?? (() => new Date()))().toISOString() });

    let res: Response;
    try {
        res = await fetchImpl("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
        });
    } catch {
        dispatch({ type: "send_failed", message: NETWORK });
        return "failed";
    }
    if (!res.ok || !res.body) {
        dispatch({ type: "send_failed", message: res.status === 401 ? EXPIRED : await errorMessage(res) });
        return "failed";
    }

    const batcher = createFrameBatcher((delta) => dispatch({ type: "text", delta }), deps.schedule);
    let outcome: "ok" | "failed" = "ok";

    try {
        for await (const ev of readSse(res.body)) {
            const data = ev.data as Record<string, unknown>;
            switch (ev.event) {
                case "user_message":
                    dispatch({ type: "user_message", message: ev.data as MessageDto });
                    break;
                case "text":
                    batcher.push(String(data.delta ?? ""));
                    break;
                case "agent_message":
                    batcher.flush(); // o que foi transmitido entra antes da mensagem oficial que o substitui
                    dispatch({ type: "agent_message", message: ev.data as MessageDto });
                    break;
                case "blocked":
                    dispatch({ type: "blocked", message: String(data.message ?? GENERIC), used: Number(data.used), limit: Number(data.limit) });
                    break;
                case "paused":
                    dispatch({ type: "paused", state: data.state as ConversationState });
                    break;
                case "done":
                    batcher.flush();
                    dispatch({
                        type: "done",
                        state: data.state as ConversationState,
                        session: data.session as SessionInfo,
                        hasPendingAction: data.hasPendingAction === true,
                    });
                    break;
                case "error":
                    batcher.flush();
                    dispatch({ type: "send_failed", message: String(data.message ?? GENERIC) });
                    outcome = "failed";
                    break;
            }
        }
    } catch {
        batcher.flush();
        dispatch({ type: "send_failed", message: "A conexão foi interrompida. Recarregue a página para ver a resposta, se ela chegou a ser gerada." });
        return "failed";
    }
    return outcome;
}

export async function decide(
    decision: "confirm" | "cancel",
    deps: { dispatch: Dispatch<ChatAction>; fetchImpl?: typeof fetch },
): Promise<void> {
    const { dispatch, fetchImpl = fetch } = deps;
    dispatch({ type: "button_started" });
    try {
        const res = await fetchImpl("/api/chat/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ decision }),
        });
        if (!res.ok) {
            dispatch({ type: "button_failed", message: res.status === 401 ? EXPIRED : await errorMessage(res) });
            return;
        }
        const data = (await res.json()) as {
            userMessage: MessageDto;
            agentMessage: MessageDto;
            state: ConversationState;
            hasPendingAction: boolean;
        };
        dispatch({ type: "button_done", ...data });
    } catch {
        dispatch({ type: "button_failed", message: NETWORK });
    }
}