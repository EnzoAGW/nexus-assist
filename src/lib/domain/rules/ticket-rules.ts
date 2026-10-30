import type { Ticket } from "../model/schemas";

export const REOPEN_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Resolvidos há até 7 dias podem ser reabertos. */
export function canReopen(ticket: Pick<Ticket, "status" | "resolvedAt">, now: Date): boolean {
    if (ticket.status !== "resolved" || !ticket.resolvedAt) return false;
    return now.getTime() - ticket.resolvedAt.getTime() <= REOPEN_WINDOW_DAYS * DAY_MS;
}

/** Privacidade: um chamado só é visível a quem o abriu. */
export function canAccessTicket(ticket: Pick<Ticket, "requesterEmail">, userEmail: string): boolean {
    return ticket.requesterEmail.toLowerCase() === userEmail.toLowerCase();
}