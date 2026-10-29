import type { TicketDraft } from "@/lib/domain/schemas";
import type { TraceAction } from "@/lib/domain/trace";
import { TicketSystemUnavailableError } from "@/services/errors";

/** Elementos ricos da mensagem. São salvos em `messages.ui` como `{ elements: UiElement[] }`. */
export type UiElement =
    | { type: "quick_replies"; options: string[] }
    | { type: "ticket_list"; ticketIds: string[] }
    | { type: "ticket_card"; ticketId: string }
    | { type: "draft"; draft: TicketDraft; dueAt: string; priorityReason: string; ruleId: string }
    | { type: "update_draft"; ticketId: string; note: string; reopen: boolean };

/** O que aparece no trace quando uma ação falha: nunca a mensagem interna do erro. */
function safeErrorSummary(err: unknown): string {
    if (err instanceof TicketSystemUnavailableError) return "sistema de chamados indisponível";
    console.error("Falha em ação do agent:", err);
    return "falha inesperada";
}

export function createRecorder() {
    const actions: TraceAction[] = [];
    const rules = new Set<string>();
    const ui: UiElement[] = [];

    return {
        actions,
        rules,
        ui,
        /** Executa uma ação medindo a duração e registrando o resultado (ok ou erro). */
        async track<T>(tool: string, label: string, fn: () => Promise<{ value: T; summary: string }>): Promise<T> {
            const started = performance.now();
            const elapsed = () => Math.round(performance.now() - started);
            try {
                const { value, summary } = await fn();
                actions.push({ tool, label, status: "ok", summary, durationMs: elapsed() });
                return value;
            } catch (err) {
                actions.push({ tool, label, status: "error", summary: safeErrorSummary(err), durationMs: elapsed() });
                throw err;
            }
        },
    };
}

export type TurnRecorder = ReturnType<typeof createRecorder>;