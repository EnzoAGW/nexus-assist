import { PRIORITY_LABEL } from "@/lib/domain/enums";
import { formatDateTime } from "@/lib/domain/format";
import type { PendingAction } from "@/lib/domain/schemas";
import type { TraceAction } from "@/lib/domain/trace";
import { HANDOFF } from "@/lib/domain/handoff";
import type { Services } from "@/services";
import type { TicketView } from "@/services/tickets";
import type { UiElement } from "./turn";

type ConfirmServices = Pick<Services, "tickets" | "conversations">;

export const TICKETS_DOWN_TEXT =
    "O sistema de chamados está instável e não consegui concluir agora. Seu rascunho continua salvo: tente confirmar de novo em instantes.";

export type ConfirmOutcome =
    | { status: "nothing_pending" }
    | { status: "created"; ticket: TicketView; handedOff: boolean }
    | { status: "duplicate"; existing: TicketView }
    | { status: "updated" | "reopened"; ticket: TicketView }
    | { status: "not_found" | "cannot_reopen" | "closed"; ticketId: string };

export interface ConfirmResult {
    outcome: ConfirmOutcome;
    text: string;
    ui: UiElement[];
    actions: TraceAction[];
    rules: string[];
    handoffReason: string | null;
}

async function apply(
    services: ConfirmServices,
    userEmail: string,
    conversationId: string,
    action: PendingAction,
): Promise<ConfirmOutcome> {
    if (action.kind === "update_ticket") {
        const r = await services.tickets.addUpdate(userEmail, action.ticketId, action.note);
        if (r.status === "updated" || r.status === "reopened") return { status: r.status, ticket: r.ticket };
        return { status: r.status, ticketId: action.ticketId };
    }

    const result = await services.tickets.createTicket(userEmail, action.draft);
    if (result.status === "duplicate") return { status: "duplicate", existing: result.candidates[0]!.ticket };

    const { ticket } = result;
    let handedOff = false;
    if (ticket.priority === "critical") {
        try {
            await services.conversations.requestHandoff(userEmail, conversationId, {
                reason: "Chamado crítico: prazo de primeira resposta de 1 hora",
                summary: `Chamado ${ticket.id} aberto: ${ticket.title}. ${ticket.description}`,
            });
            handedOff = true;
        } catch (err) {
            console.error("Falha ao transferir chamado crítico:", err); // o chamado já existe; não desfazemos
        }
    }
    return { status: "created", ticket, handedOff };
}

function describe(outcome: ConfirmOutcome, durationMs: number, action?: PendingAction): ConfirmResult {
    const tool = action?.kind === "update_ticket" ? "addTicketUpdate" : "createTicket";
    const card = (id: string): UiElement => ({ type: "ticket_card", ticketId: id });
    const done = (label: string, summary: string): TraceAction[] => [
        { tool, label, status: "ok", summary, durationMs },
    ];
    const base = { rules: ["explicit-confirmation"], handoffReason: null };

    switch (outcome.status) {
        case "nothing_pending":
            return { outcome, text: "Não há nenhum rascunho aguardando confirmação.", ui: [], actions: [], ...base, rules: [] };

        case "created": {
            const t = outcome.ticket;
            const handoff = outcome.handedOff
                ? " Por ser crítico, já chamei um analista: ele continua o atendimento por aqui."
                : "";
            return {
                outcome,
                text: `Chamado ${t.id} aberto. Prioridade ${PRIORITY_LABEL[t.priority]}, primeira resposta até ${formatDateTime(t.dueAt)}.${handoff}`,
                ui: [card(t.id)],
                actions: done("criou o chamado", `${t.id} (${PRIORITY_LABEL[t.priority]})`),
                rules: outcome.handedOff ? ["explicit-confirmation", "critical-handoff"] : base.rules,
            handoffReason: outcome.handedOff ? HANDOFF.critical : null,
            };
        }

        case "duplicate":
            return {
                outcome,
                text: `Já existe o ${outcome.existing.id} sobre o mesmo problema, então não abri outro. Quer acrescentar suas informações a ele?`,
                ui: [{ type: "quick_replies", options: ["Adicionar informações", "Não, obrigado"] }],
                actions: done("evitou chamado duplicado", `já existe ${outcome.existing.id}`),
                rules: ["explicit-confirmation", "duplicate-check"],
                handoffReason: null,
            };

        case "updated":
            return {
                outcome,
                text: `Pronto, acrescentei suas informações ao ${outcome.ticket.id}. O prazo de resposta do chamado continua o mesmo.`,
                ui: [card(outcome.ticket.id)],
                actions: done("atualizou o chamado", outcome.ticket.id),
                ...base,
            };

        case "reopened":
            return {
                outcome,
                text: `Reabri o ${outcome.ticket.id}. O prazo de primeira resposta recomeçou.`,
                ui: [card(outcome.ticket.id)],
                actions: done("reabriu o chamado", outcome.ticket.id),
                rules: ["explicit-confirmation", "reopen-window-7d"],
                handoffReason: null,
            };

        case "cannot_reopen":
            return {
                outcome,
                text: `O ${outcome.ticketId} foi resolvido há mais de 7 dias e não pode ser reaberto. Posso abrir um chamado novo para você.`,
                ui: [],
                actions: done("recusou a reabertura", `${outcome.ticketId} fora da janela de 7 dias`),
                rules: ["explicit-confirmation", "reopen-window-7d"],
                handoffReason: null,
            };

        case "closed":
            return {
                outcome,
                text: `O ${outcome.ticketId} está encerrado e não aceita atualizações.`,
                ui: [],
                actions: done("recusou a atualização", `${outcome.ticketId} encerrado`),
                ...base,
            };

        case "not_found":
            return {
                outcome,
                text: "Não encontrei esse chamado entre os seus.",
                ui: [],
                actions: done("não encontrou o chamado", "chamado inexistente ou de outra pessoa"),
                ...base,
            };
    }
}

export async function executePending(
    services: ConfirmServices,
    userEmail: string,
    conversationId: string,
): Promise<ConfirmResult> {
    const started = performance.now();
    const action = await services.conversations.takePendingAction(userEmail, conversationId);
    if (!action) return describe({ status: "nothing_pending" }, 0);

    try {
        const outcome = await apply(services, userEmail, conversationId, action);
        return describe(outcome, Math.round(performance.now() - started), action);
    } catch (err) {
        await services.conversations.setPendingAction(userEmail, conversationId, action);
        throw err;
    }
}

export async function cancelPending(
    services: Pick<Services, "conversations">,
    userEmail: string,
    conversationId: string,
): Promise<{ text: string }> {
    await services.conversations.setPendingAction(userEmail, conversationId, null);
    return { text: "Tudo bem, cancelei o rascunho. Posso ajudar com mais alguma coisa?" };
}