import type { Impact, Priority, TicketType } from "../model/enums";

export interface PriorityInput {
    type: TicketType;
    impact: Impact;
    /** Impede o trabalho / não há alternativa. */
    blocksWork: boolean;
    /** Há um compromisso em risco ainda hoje. */
    deadlineToday: boolean;
}

export interface PriorityResult {
    priority: Priority;
    reason: string;
    /** Qual regra decidiu. Vai para o painel de transparência. */
    ruleId: string;
}

interface PriorityRule {
    id: string;
    when: (i: PriorityInput) => boolean;
    priority: Priority;
    reason: (i: PriorityInput) => string;
}

const isGroup = (i: PriorityInput) => i.impact === "team" || i.impact === "company";

/** A ORDEM IMPORTA: a primeira regra que casar vence (da mais grave para a menos). */
const RULES: readonly PriorityRule[] = [
    {
        id: "group-blocked",
        when: (i) => i.blocksWork && isGroup(i),
        priority: "critical",
        reason: (i) => `Algo parado para ${i.impact === "company" ? "a empresa" : "uma equipe"}.`,
    },
    {
        id: "person-blocked",
        when: (i) => i.blocksWork,
        priority: "high",
        reason: () => "Impede uma pessoa de trabalhar.",
    },
    {
        id: "same-day-commitment",
        when: (i) => i.deadlineToday,
        priority: "high",
        reason: () => "Há um compromisso no mesmo dia.",
    },
    {
        id: "incident-with-workaround",
        when: (i) => i.type === "INC",
        priority: "medium",
        reason: () => "Atrapalha, mas há alternativa.",
    },
    {
        id: "request-no-urgency",
        when: () => true, // regra padrão: sempre casa
        priority: "low",
        reason: () => "Pedido sem urgência.",
    },
];

export function derivePriority(input: PriorityInput): PriorityResult {
    // A última regra sempre casa, então o find nunca retorna undefined.
    const rule = RULES.find((r) => r.when(input)) ?? RULES[RULES.length - 1]!;
    return { priority: rule.priority, reason: rule.reason(input), ruleId: rule.id };
}