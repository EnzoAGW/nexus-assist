import { PRIORITY_LABEL, STATUS_LABEL, type Category, type Impact, type MessageRole, type Priority, type TicketStatus, type TicketType } from "@/lib/domain/model/enums";
import type { DecisionTrace } from "@/lib/domain/model/trace";
import type { Message } from "@/services/conversations";
import type { TicketView } from "@/services/tickets";
import type { ConversationState } from "@/lib/domain/model/enums";
import { HANDOFF_KIND_LABEL, handoffKind, type HandoffKind } from "@/lib/domain/rules/handoff";
import type { ConsoleListItem } from "@/services/analyst-console";
import type { Conversation } from "@/services/conversations";

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
export interface ConsoleItemDto {
    id: string;
    employee: { name: string; email: string };
    state: ConversationState;
    handoffReason: string | null;
    handoffKind: HandoffKind | null;
    handoffKindLabel: string | null;
    assignedAnalystName: string | null;
    preview: string;
    lastActivityAt: string;
    assignedAnalystEmail: string | null;
    waitingMessages: number;
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
export const toConsoleItemDto = (i: ConsoleListItem): ConsoleItemDto => ({
    ...i,
    handoffKindLabel: i.handoffKind ? HANDOFF_KIND_LABEL[i.handoffKind] : null,
    lastActivityAt: i.lastActivityAt.toISOString(),
});

export const toConversationDto = (c: Conversation, assignedAnalystName: string | null = null) => ({
    id: c.id,
    state: c.state,
    handoffReason: c.handoffReason,
    handoffKind: handoffKind(c.handoffReason),
    handoffKindLabel: handoffKind(c.handoffReason) ? HANDOFF_KIND_LABEL[handoffKind(c.handoffReason)!] : null,
    handoffSummary: c.handoffSummary,
    assignedAnalystEmail: c.assignedAnalystEmail,
    assignedAnalystName,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
});

export type ConversationDto = ReturnType<typeof toConversationDto>;