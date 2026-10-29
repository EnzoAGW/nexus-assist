import { PRIORITY_LABEL, STATUS_LABEL, type Category, type Impact, type MessageRole, type Priority, type TicketStatus, type TicketType } from "@/lib/domain/enums";
import type { DecisionTrace } from "@/lib/domain/trace";
import type { Message } from "@/services/conversations";
import type { TicketView } from "@/services/tickets";

export interface MessageDto {
    id: string;
    role: MessageRole;
    content: string;
    authorEmail: string | null;
    trace: DecisionTrace | null;
    ui: Message["ui"];
    createdAt: string;
}

export interface TicketDto {
    id: string;
    title: string;
    description: string;
    type: TicketType;
    category: Category;
    priority: Priority;
    priorityLabel: string;
    status: TicketStatus;
    statusLabel: string;
    impact: Impact;
    createdAt: string;
    lastUpdatedAt: string;
    dueAt: string;
    overdue: boolean;
    reopenable: boolean;
}

export const toMessageDto = (m: Message): MessageDto => ({
    id: m.id,
    role: m.role,
    content: m.content,
    authorEmail: m.authorEmail,
    trace: m.trace,
    ui: m.ui,
    createdAt: m.createdAt.toISOString(),
});

/** Não inclui o e-mail do solicitante: o cliente só recebe os próprios chamados e não precisa dele. */
export const toTicketDto = (t: TicketView): TicketDto => ({
    id: t.id,
    title: t.title,
    description: t.description,
    type: t.type,
    category: t.category,
    priority: t.priority,
    priorityLabel: PRIORITY_LABEL[t.priority],
    status: t.status,
    statusLabel: STATUS_LABEL[t.status],
    impact: t.impact,
    createdAt: t.createdAt.toISOString(),
    lastUpdatedAt: t.lastUpdatedAt.toISOString(),
    dueAt: t.dueAt.toISOString(),
    overdue: t.overdue,
    reopenable: t.reopenable,
});