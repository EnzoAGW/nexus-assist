export const TICKET_TYPES = ["INC", "REQ"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const CATEGORIES = ["Acesso", "Rede e VPN", "Hardware", "Software", "E-mail", "Outros"] as const;
export type Category = (typeof CATEGORIES)[number];

export const PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

// "Vencido" NÃO é status: é derivado do prazo (ver sla.ts).
export const TICKET_STATUSES = [
    "open",
    "in_progress",
    "awaiting_analyst",
    "approved",
    "resolved",
    "closed",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

// Quantas pessoas são afetadas ("Só eu / Minha equipe / Toda a empresa / Não sei").
export const IMPACTS = ["single", "team", "company", "unknown"] as const;
export type Impact = (typeof IMPACTS)[number];

export const USER_ROLES = ["employee", "analyst"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const MESSAGE_ROLES = ["user", "agent", "analyst", "system"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const CONVERSATION_STATES = ["with_agent", "awaiting_analyst", "with_analyst", "closed"] as const;
export type ConversationState = (typeof CONVERSATION_STATES)[number];

// Rótulos para a UI e para o agent.
export const PRIORITY_LABEL: Record<Priority, string> = {
    critical: "Crítica",
    high: "Alta",
    medium: "Média",
    low: "Baixa",
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
    open: "Aberto",
    in_progress: "Em andamento",
    awaiting_analyst: "Aguardando analista",
    approved: "Aprovado",
    resolved: "Resolvido",
    closed: "Encerrado",
};

export const IMPACT_LABEL: Record<Impact, string> = {
    single: "Somente você",
    team: "Sua equipe",
    company: "Toda a empresa",
    unknown: "Não sei",
};