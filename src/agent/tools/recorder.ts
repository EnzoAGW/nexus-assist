import type { TraceAction } from "@/lib/domain/model/trace";
import { TicketSystemUnavailableError } from "@/services/errors";
import type { UiElement } from "@/lib/domain/model/ui";
export type { UiElement };

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