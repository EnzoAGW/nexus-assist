import type { ConversationState, TicketStatus } from "@/lib/domain/model/enums";
import type { HandoffKind } from "@/lib/domain/rules/handoff";
import { analystMayReply, canTransition } from "@/lib/domain/rules/conversation-state";
import { isActiveStatus } from "@/lib/domain/rules/sla";
import type { UiElement } from "@/lib/domain/model/ui";

export type ConsoleMode = "waiting" | "mine" | "other" | "agent" | "closed";
export type Tone = "red" | "amber" | "blue" | "green" | "slate";

export interface ConsoleSubject {
    state: ConversationState;
    assignedAnalystEmail: string | null;
}

export function consoleMode(s: ConsoleSubject, me: string): ConsoleMode {
    switch (s.state) {
        case "awaiting_analyst":
            return "waiting";
        case "with_analyst":
            return s.assignedAnalystEmail === me ? "mine" : "other";
        case "with_agent":
            return "agent";
        case "closed":
            return "closed";
    }
}

export interface AvailableActions {
    claim: boolean;
    returnToAgent: boolean;
    close: boolean;
    reply: boolean;
}

/** Deriva do domínio: a tela oferece exatamente o que o servidor aceitaria. */
export function availableActions(s: ConsoleSubject, me: string): AvailableActions {
    const mode = consoleMode(s, me);
    const mine = mode === "mine";
    return {
        claim: canTransition(s.state, "with_analyst"),
        returnToAgent: canTransition(s.state, "with_agent") && (mode === "waiting" || mine),
        close: mine && canTransition(s.state, "closed"),
        reply: mine && analystMayReply(s.state),
    };
}

export const kindTone = (kind: HandoffKind | null): Tone =>
    kind === "critical" ? "red" : kind === "requested" ? "blue" : "amber";

export interface StatusSubject extends ConsoleSubject {
    handoffKind: HandoffKind | null;
    handoffKindLabel: string | null;
    assignedAnalystName: string | null;
}

export function itemStatus(s: StatusSubject, me: string): { label: string; tone: Tone } {
    switch (consoleMode(s, me)) {
        case "waiting":
            return { label: s.handoffKindLabel ?? "Aguardando atendente", tone: kindTone(s.handoffKind) };
        case "mine":
            return { label: "Com você", tone: "blue" };
        case "other":
            return { label: `Com ${s.assignedAnalystName ?? "outro analista"}`, tone: "slate" };
        case "agent":
            return { label: "Com o agent", tone: "green" };
        case "closed":
            return { label: "Encerrada", tone: "slate" };
    }
}

const TICKET_ID = /\b(?:INC|REQ)-\d{3,}\b/gi;

/** Chamado em foco: o último citado na conversa; senão o vencido; senão o primeiro ativo. */
export function pickFocusTicket<T extends { id: string; overdue: boolean; status: TicketStatus }>(
    tickets: readonly T[],
    hints: readonly string[],
): T | null {
    for (const hint of [...hints].reverse()) {
        for (const m of hint.matchAll(TICKET_ID)) {
            const found = tickets.find((t) => t.id === m[0].toUpperCase());
            if (found) return found;
        }
    }
    return tickets.find((t) => t.overdue) ?? tickets.find((t) => isActiveStatus(t.status)) ?? tickets[0] ?? null;
}

/** O analista não vê os botões do funcionário, mas vê o que o agent exibiu. */
export function describeUi(el: UiElement): string {
    switch (el.type) {
        case "draft":
            return `Rascunho de chamado exibido: ${el.draft.title}`;
        case "update_draft":
            return `${el.reopen ? "Reabertura" : "Atualização"} do ${el.ticketId} proposta`;
        case "ticket_card":
            return `Mostrou o chamado ${el.ticketId}`;
        case "ticket_list":
            return `Mostrou a lista de chamados (${el.ticketIds.length})`;
        case "quick_replies":
            return `Ofereceu: ${el.options.join(" · ")}`;
    }
}