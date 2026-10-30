import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import {
    CATEGORIES,
    CONVERSATION_STATES,
    IMPACTS,
    MESSAGE_ROLES,
    PRIORITIES,
    TICKET_STATUSES,
    TICKET_TYPES,
    USER_ROLES,
} from "@/lib/domain/model/enums";
import type { PendingAction } from "@/lib/domain/model/schemas";
import type { DecisionTrace } from "@/lib/domain/model/trace";

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

export const users = sqliteTable("users", {
    email: text("email").primaryKey(),
    name: text("name").notNull(),
    role: text("role", { enum: USER_ROLES }).notNull(),
    /** Só analistas: N1 ou N2. */
    level: text("level", { enum: ["N1", "N2"] }),
    /** Só analistas: toggle "Disponível" do console. */
    available: integer("available", { mode: "boolean" }).notNull().default(true),
    passwordChangedAt: timestamp("password_changed_at").notNull(),
});

export const tickets = sqliteTable(
    "tickets",
    {
        id: text("id").primaryKey(), // INC-20311, REQ-10442
        requesterEmail: text("requester_email")
            .notNull()
            .references(() => users.email),
        title: text("title").notNull(),
        description: text("description").notNull(),
        type: text("type", { enum: TICKET_TYPES }).notNull(),
        category: text("category", { enum: CATEGORIES }).notNull(),
        priority: text("priority", { enum: PRIORITIES }).notNull(),
        impact: text("impact", { enum: IMPACTS }).notNull(),
        status: text("status", { enum: TICKET_STATUSES }).notNull(),
        createdAt: timestamp("created_at").notNull(),
        /** Base do prazo: reinicia a cada atualização do service desk. */
        lastUpdatedAt: timestamp("last_updated_at").notNull(),
        resolvedAt: timestamp("resolved_at"),
    },
    (t) => [index("tickets_requester_idx").on(t.requesterEmail)],
);

/** Histórico de complementos e reaberturas de um chamado. */
export const ticketUpdates = sqliteTable(
    "ticket_updates",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        ticketId: text("ticket_id")
            .notNull()
            .references(() => tickets.id),
        authorEmail: text("author_email")
            .notNull()
            .references(() => users.email),
        note: text("note").notNull(),
        createdAt: timestamp("created_at").notNull(),
    },
    (t) => [index("ticket_updates_ticket_idx").on(t.ticketId)],
);

export const articles = sqliteTable("articles", {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    category: text("category", { enum: CATEGORIES }).notNull(),
    content: text("content").notNull(),
    /** Palavras-chave separadas por vírgula, usadas na busca. */
    keywords: text("keywords").notNull(),
});

export const conversations = sqliteTable(
    "conversations",
    {
        id: text("id").primaryKey(),
        userEmail: text("user_email")
            .notNull()
            .references(() => users.email),
        /** Quem responde agora: agent ou analista. É isto que sobrevive ao reinício. */
        state: text("state", { enum: CONVERSATION_STATES }).notNull().default("with_agent"),
        assignedAnalystEmail: text("assigned_analyst_email").references(() => users.email),
        /** Resumo do caso, gerado na transferência. */
        handoffSummary: text("handoff_summary"),
        handoffReason: text("handoff_reason"),
        /** Rascunho aguardando confirmação. Null quando não há nada pendente. */
        pendingAction: text("pending_action", { mode: "json" }).$type<PendingAction>(),
        /** Mensagens do funcionário na sessão atual (limite de 30). Zera a cada login. */
        sessionMessageCount: integer("session_message_count").notNull().default(0),
        createdAt: timestamp("created_at").notNull(),
        updatedAt: timestamp("updated_at").notNull(),
    },
    (t) => [index("conversations_user_idx").on(t.userEmail), index("conversations_state_idx").on(t.state)],
);

export const messages = sqliteTable(
    "messages",
    {
        id: text("id").primaryKey(),
        conversationId: text("conversation_id")
            .notNull()
            .references(() => conversations.id),
        role: text("role", { enum: MESSAGE_ROLES }).notNull(),
        content: text("content").notNull(),
        /** Quem escreveu, para mensagens de analista. */
        authorEmail: text("author_email"),
        /** Só mensagens do agent: a decisão por trás da resposta. */
        trace: text("trace", { mode: "json" }).$type<DecisionTrace>(),
        /** Elementos ricos da UI (cards de chamado, opções rápidas, rascunho). */
        ui: text("ui", { mode: "json" }).$type<Record<string, unknown>>(),
        createdAt: timestamp("created_at").notNull(),
    },
    (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);