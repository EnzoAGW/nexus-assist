import { z } from "zod";
import {
    CATEGORIES,
    CONVERSATION_STATES,
    IMPACTS,
    MESSAGE_ROLES,
    PRIORITIES,
    TICKET_STATUSES,
    TICKET_TYPES,
    USER_ROLES,
} from "./enums";

export const ticketTypeSchema = z.enum(TICKET_TYPES);
export const categorySchema = z.enum(CATEGORIES);
export const prioritySchema = z.enum(PRIORITIES);
export const ticketStatusSchema = z.enum(TICKET_STATUSES);
export const impactSchema = z.enum(IMPACTS);
export const userRoleSchema = z.enum(USER_ROLES);
export const messageRoleSchema = z.enum(MESSAGE_ROLES);
export const conversationStateSchema = z.enum(CONVERSATION_STATES);

/** O que o agent propõe e o funcionário confirma. Ainda não é um chamado. */
export const ticketDraftSchema = z.object({
    title: z.string().trim().min(5, "Título muito curto").max(120),
    description: z.string().trim().min(20, "Descrição muito curta").max(2000),
    type: ticketTypeSchema,
    category: categorySchema,
    priority: prioritySchema,
    impact: impactSchema,
});
export type TicketDraft = z.infer<typeof ticketDraftSchema>;

export const ticketSchema = ticketDraftSchema.extend({
    id: z.string().regex(/^(INC|REQ)-\d+$/),
    requesterEmail: z.string().email(),
    status: ticketStatusSchema,
    createdAt: z.coerce.date(),
    /** Última atualização do lado do service desk. Base do prazo. */
    lastUpdatedAt: z.coerce.date(),
    resolvedAt: z.coerce.date().nullable(),
});
export type Ticket = z.infer<typeof ticketSchema>;

export const userSchema = z.object({
    email: z.string().email(),
    name: z.string().min(1),
    role: userRoleSchema,
    /** Só analistas. */
    level: z.enum(["N1", "N2"]).nullable(),
});

/** Ação que aguarda o "Confirmar" do funcionário. Só existe uma por conversa. */
export const pendingActionSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("create_ticket"),
        draft: ticketDraftSchema,
    }),
    z.object({
        kind: z.literal("update_ticket"),
        ticketId: z.string(),
        note: z.string().trim().min(1).max(2000),
        reopen: z.boolean(),
    }),
]);

export type PendingAction = z.infer<typeof pendingActionSchema>;

export type User = z.infer<typeof userSchema>;