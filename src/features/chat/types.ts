import type { TicketDto } from "@/server/serialize";

export interface ChatHandlers {
    onQuickReply(text: string): void;
    onPickTicket(ticket: TicketDto): void;
    onConfirm(): void;
    onCancel(): void;
    onEdit(): void;
}

export interface BubbleContext {
    tickets: TicketDto[] | null;
    activeDraftId: string | null;
    interactiveId: string | null;
    busy: boolean;
    handlers: ChatHandlers;
}