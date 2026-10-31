import type { ConsoleFilter } from "@/lib/domain/model/console";
import type { ConsoleItemDto, ConversationDto, MessageDto, TicketDto } from "@/server/serialize";
import { SessionExpiredError } from "./chat-api";

export interface ConsoleList {
    items: ConsoleItemDto[];
    counts: Record<ConsoleFilter, number>;
    me: { name: string; email: string; level: "N1" | "N2" | null; available: boolean };
}

export interface ConsoleDetailResponse {
    conversation: ConversationDto;
    employee: { name: string; email: string };
    messages: MessageDto[];
    /** `null` = sistema de chamados indisponível agora. */
    tickets: TicketDto[] | null;
}

export class ConsoleApiError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = "ConsoleApiError";
    }
}

const GENERIC = "Algo deu errado. Tente novamente.";
const NETWORK = "Não consegui conectar. Verifique sua conexão e tente de novo.";

async function request<T>(fetchImpl: typeof fetch, path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
        res = await fetchImpl(path, { cache: "no-store", ...init });
    } catch {
        throw new ConsoleApiError(0, "network", NETWORK);
    }
    if (res.status === 401) throw new SessionExpiredError();
    if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { code?: unknown; message?: unknown } } | null;
        throw new ConsoleApiError(
            res.status,
            typeof body?.error?.code === "string" ? body.error.code : "unknown",
            typeof body?.error?.message === "string" ? body.error.message : GENERIC,
        );
    }
    return (await res.json()) as T;
}

const post = (body: unknown): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
});

export function fetchList(opts: { filter: ConsoleFilter; query: string }, fetchImpl: typeof fetch = fetch) {
    const params = new URLSearchParams({ filter: opts.filter });
    const q = opts.query.trim();
    if (q) params.set("q", q);
    return request<ConsoleList>(fetchImpl, `/api/console/conversations?${params}`);
}

export const fetchDetail = (id: string, fetchImpl: typeof fetch = fetch) =>
    request<ConsoleDetailResponse>(fetchImpl, `/api/console/conversations/${encodeURIComponent(id)}`);

export const runAction = (id: string, action: "claim" | "return" | "close", fetchImpl: typeof fetch = fetch) =>
    request<{ conversation: ConversationDto }>(fetchImpl, `/api/console/conversations/${encodeURIComponent(id)}/action`, post({ action }));

export const postReply = (id: string, text: string, fetchImpl: typeof fetch = fetch) =>
    request<{ message: MessageDto }>(fetchImpl, `/api/console/conversations/${encodeURIComponent(id)}/messages`, post({ text }));

export const setAvailability = (available: boolean, fetchImpl: typeof fetch = fetch) =>
    request<{ available: boolean }>(fetchImpl, "/api/console/availability", { ...post({ available }), method: "PATCH" });

/** Mensagem para o analista; conflitos de concorrência são esperados e não são "erro". */
export function friendlyError(err: unknown): string {
    if (!(err instanceof ConsoleApiError)) return GENERIC;
    switch (err.status) {
        case 0:
            return NETWORK;
        case 409:
            return "A conversa mudou de estado enquanto você agia. Atualizei a tela.";
        case 403:
            return "Esta conversa está com outro analista.";
        case 404:
            return "Conversa não encontrada.";
        default:
            return err.message;
    }
}