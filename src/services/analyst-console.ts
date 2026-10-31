import { and, desc, eq, like, ne, or, sql, type SQL } from "drizzle-orm";
import { conversations, messages, users } from "@/db/schema";
import type { Db } from "@/db/types";
import type { ConversationState } from "@/lib/domain/model/enums";
import { handoffKind, type HandoffKind } from "@/lib/domain/rules/handoff";
import type { Conversation, Message } from "./conversations";
import { RuleError } from "./errors";
import { createUserService } from "./users";
import { CONSOLE_FILTERS, type ConsoleFilter } from "@/lib/domain/model/console";

export { CONSOLE_FILTERS };
export type { ConsoleFilter };


export interface ConsoleListItem {
    id: string;
    employee: { name: string; email: string };
    state: ConversationState;
    handoffReason: string | null;
    handoffKind: HandoffKind | null;
    assignedAnalystName: string | null;
    preview: string;
    lastActivityAt: Date;
    assignedAnalystEmail: string | null;
    /** Mensagens do funcionário sem resposta (as últimas, até a resposta do agent ou do analista). */
    waitingMessages: number;
}

export type ConsoleCounts = Record<ConsoleFilter, number>;

export interface ConsoleDetail {
    conversation: Conversation;
    employee: { name: string; email: string };
    assignedAnalystName: string | null;
    messages: Message[];
}

const PREVIEW_CHARS = 120;
const RECENT_WINDOW = 10;

export function createAnalystConsoleService(db: Db) {
    const userService = createUserService(db);

    const stateCondition = (filter: ConsoleFilter, me: string): SQL | undefined => {
        switch (filter) {
            case "waiting":
                return eq(conversations.state, "awaiting_analyst");
            case "mine":
                return and(eq(conversations.state, "with_analyst"), eq(conversations.assignedAnalystEmail, me));
            case "agent":
                return eq(conversations.state, "with_agent");
            case "closed":
                return eq(conversations.state, "closed");
            case "all":
                return ne(conversations.state, "closed");
        }
    };

    const recentMessages = (conversationId: string) =>
        db
            .select({ role: messages.role, content: messages.content })
            .from(messages)
            .where(eq(messages.conversationId, conversationId))
            .orderBy(desc(messages.createdAt), sql`rowid desc`)
            .limit(RECENT_WINDOW);

    /** Quem precisa de atenção primeiro: na fila (mais antiga antes), depois as minhas, depois o resto. */
    async function list(
        analystEmail: string,
        opts: { filter?: ConsoleFilter; query?: string; limit?: number } = {},
    ): Promise<ConsoleListItem[]> {
        const me = (await userService.requireAnalyst(analystEmail)).email;
        const filter = opts.filter ?? "all";
        const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);

        // Sem curingas do usuário: % e _ viram espaço em vez de mudar o sentido da busca.
        const q = (opts.query ?? "").replace(/[%_\\]/g, " ").trim();
        const search = q ? or(like(users.name, `%${q}%`), like(conversations.userEmail, `%${q}%`)) : undefined;

        const bucket = sql`case ${conversations.state} when 'awaiting_analyst' then 0 when 'with_analyst' then 1 when 'with_agent' then 2 else 3 end`;
        const oldestFirstWhenWaiting = sql`case when ${conversations.state} = 'awaiting_analyst' then ${conversations.updatedAt} end`;

        const rows = await db
            .select({ conv: conversations, name: users.name })
            .from(conversations)
            .innerJoin(users, eq(users.email, conversations.userEmail))
            .where(and(stateCondition(filter, me), search))
            .orderBy(bucket, oldestFirstWhenWaiting, desc(conversations.updatedAt))
            .limit(limit);

        const analysts = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.role, "analyst"));
        const analystName = new Map(analysts.map((a) => [a.email, a.name]));

        // Uma consulta por conversa (no máximo 100): simples e suficiente para esta escala.
        return Promise.all(
            rows.map(async ({ conv, name }): Promise<ConsoleListItem> => {
                const recent = await recentMessages(conv.id);

                let waiting = 0;
                for (const m of recent) {
                    if (m.role === "system") continue; // notas de transferência não contam
                    if (m.role !== "user") break;
                    waiting++;
                }
                const last = recent.find((m) => m.role !== "system") ?? recent[0];
                const preview = (last?.content ?? "").replace(/\s+/g, " ").slice(0, PREVIEW_CHARS);

                return {
                    id: conv.id,
                    employee: { name, email: conv.userEmail },
                    state: conv.state,
                    handoffReason: conv.handoffReason,
                    handoffKind: handoffKind(conv.handoffReason),
                    assignedAnalystName: conv.assignedAnalystEmail ? (analystName.get(conv.assignedAnalystEmail) ?? null) : null,
                    preview,
                    lastActivityAt: conv.updatedAt,
                    assignedAnalystEmail: conv.assignedAnalystEmail,
                    waitingMessages: waiting,
                };
            }),
        );
    }

    /** Números das abas. "mine" depende de quem está olhando. */
    async function counts(analystEmail: string): Promise<ConsoleCounts> {
        const me = (await userService.requireAnalyst(analystEmail)).email;
        const rows = await db
            .select({ state: conversations.state, assigned: conversations.assignedAnalystEmail, n: sql<number>`count(*)` })
            .from(conversations)
            .groupBy(conversations.state, conversations.assignedAnalystEmail);

        const result: ConsoleCounts = { all: 0, waiting: 0, mine: 0, agent: 0, closed: 0 };
        for (const r of rows) {
            const n = Number(r.n);
            if (r.state === "closed") result.closed += n;
            else result.all += n;
            if (r.state === "awaiting_analyst") result.waiting += n;
            if (r.state === "with_agent") result.agent += n;
            if (r.state === "with_analyst" && r.assigned === me) result.mine += n;
        }
        return result;
    }

    /** Qualquer analista lê qualquer conversa (precisa ver a fila antes de assumir). Funcionário nunca chega aqui. */
    async function detail(analystEmail: string, id: string): Promise<ConsoleDetail> {
        await userService.requireAnalyst(analystEmail);
        const [row] = await db
            .select({ conv: conversations, name: users.name })
            .from(conversations)
            .innerJoin(users, eq(users.email, conversations.userEmail))
            .where(eq(conversations.id, id))
            .limit(1);
        if (!row) throw new RuleError("not_found", "Conversa não encontrada.");

        const rows = await db
            .select()
            .from(messages)
            .where(eq(messages.conversationId, id))
            .orderBy(desc(messages.createdAt), sql`rowid desc`)
            .limit(200);

        const assigned = row.conv.assignedAnalystEmail ? await userService.findByEmail(row.conv.assignedAnalystEmail) : null;
        return {
            conversation: row.conv,
            employee: { name: row.name, email: row.conv.userEmail },
            assignedAnalystName: assigned?.name ?? null,
            messages: rows.reverse(),
        };
    }

    return { list, counts, detail };
}

export type AnalystConsoleService = ReturnType<typeof createAnalystConsoleService>;