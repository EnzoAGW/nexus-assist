import { TICKETS_DOWN_TEXT, cancelPending, executePending } from "@/agent/turn/confirm";
import type { UiElement } from "@/agent/tools/recorder";
import type { DecisionTrace, TraceAction } from "@/lib/domain/model/trace";
import type { Services } from "@/services/index";
import type { Message } from "@/services/conversations";
import { RuleError, TicketSystemUnavailableError } from "@/services/errors";

export type ButtonDecision = "confirm" | "cancel";
type ButtonServices = Pick<Services, "tickets" | "conversations">;

export async function resolveButton(
    services: ButtonServices,
    userEmail: string,
    conversationId: string,
    decision: ButtonDecision,
): Promise<{ userMessage: Message; agentMessage: Message }> {
    const started = performance.now();
    const conv = await services.conversations.getForUser(userEmail, conversationId);
    if (!conv) throw new RuleError("not_found", "Conversa não encontrada.");

    const userMessage = await services.conversations.addMessage(conv.id, {
        role: "user",
        content: decision === "confirm" ? "Confirmar" : "Cancelar",
    });

    let text: string;
    let rules: string[];
    let ui: UiElement[] = [];
    let actions: TraceAction[] = [];
    let handoffReason: string | null = null;

    if (decision === "cancel") {
        ({ text } = await cancelPending(services, userEmail, conv.id));
        rules = ["explicit-cancel"];
        actions = [{ tool: "cancelDraft", label: "cancelou o rascunho", status: "ok", summary: "rascunho descartado", durationMs: 0 }];
    } else {
        try {
            const r = await executePending(services, userEmail, conv.id);
            ({ text, ui, actions, handoffReason } = r);
            rules = r.rules;
        } catch (err) {
            if (!(err instanceof TicketSystemUnavailableError)) throw err;
            text = TICKETS_DOWN_TEXT; // o rascunho voltou para a conversa: dá para tentar de novo
            rules = ["legacy-unavailable"];
        }
    }

    const trace: DecisionTrace = {
        understood: decision === "confirm" ? "O funcionário confirmou o rascunho pelo botão." : "O funcionário cancelou o rascunho pelo botão.",
        intent: "confirmation",
        confidence: 1,
        reasoning: "Ação explícita pelo botão: executada pelo servidor, sem passar pelo modelo.",
        actions,
        rulesApplied: [...new Set(rules)],
        handoffReason,
        model: "sem modelo (ação por botão)",
        latencyMs: Math.round(performance.now() - started),
        usage: { inputTokens: 0, outputTokens: 0, llmCalls: 0 },
    };

    const agentMessage = await services.conversations.addMessage(conv.id, {
        role: "agent",
        content: text,
        trace,
        ui: ui.length > 0 ? { elements: ui } : null,
    });
    return { userMessage, agentMessage };
}