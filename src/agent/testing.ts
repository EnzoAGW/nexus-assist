import { articles } from "@/db/schema";
import { ARTICLES } from "@/db/seed-data";
import { createTestDb, insertTicket, insertUser, type TestDb } from "@/db/test-utils";
import type { Services } from "@/services";
import { createConversationService } from "@/services/conversations";
import { createKnowledgeBaseService } from "@/services/knowledge-base";
import { createTicketService } from "@/services/tickets";
import type { Classification } from "./classification";
import type { LlmPort } from "./llm";

export const ANA = "ana.souza@nexo.com.br";
export const CARLA = "carla.mendes@nexo.com.br";
export const RAFAEL = "rafael.lima@nexo.com.br";
export const NOW = new Date("2026-10-28T15:00:00-03:00");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

export type TestServices = Pick<Services, "tickets" | "knowledgeBase" | "conversations">;

export interface AgentEnv {
    ctx: TestDb;
    conversationId: string;
    /** `failureRate` simula o legado fora do ar. */
    services: (failureRate?: number) => TestServices;
}

export async function createAgentEnv(maxMessages = 30): Promise<AgentEnv> {
    const ctx = await createTestDb();
    await insertUser(ctx.db, { email: ANA, name: "Ana Souza" });
    await insertUser(ctx.db, { email: CARLA, name: "Carla Mendes" });
    await insertUser(ctx.db, { email: RAFAEL, name: "Rafael Lima", role: "analyst", level: "N2" });
    await ctx.db.insert(articles).values(ARTICLES.map((a) => ({ ...a })));

    await insertTicket(ctx.db, {
        id: "INC-20311", requesterEmail: ANA, status: "awaiting_analyst",
        createdAt: daysAgo(8), lastUpdatedAt: daysAgo(6),
    });
    await insertTicket(ctx.db, {
        id: "INC-20150", requesterEmail: ANA, title: "Senha do SAP bloqueada", category: "Acesso",
        status: "resolved", lastUpdatedAt: daysAgo(4), resolvedAt: daysAgo(4),
    });
    await insertTicket(ctx.db, {
        id: "INC-20044", requesterEmail: ANA, title: "Outlook não sincroniza no celular", category: "E-mail",
        status: "resolved", lastUpdatedAt: daysAgo(9), resolvedAt: daysAgo(9),
    });
    await insertTicket(ctx.db, { id: "INC-20305", requesterEmail: CARLA });

    const services = (failureRate = 0): TestServices => ({
        tickets: createTicketService(ctx.db, {
            now: () => NOW,
            resilience: { failureRate, maxAttempts: 2, baseDelayMs: 0, random: () => 0.5, sleep: async () => { } },
        }),
        knowledgeBase: createKnowledgeBaseService(ctx.db),
        conversations: createConversationService(ctx.db, { maxMessagesPerSession: maxMessages, now: () => NOW }),
    });

    const conv = await services().conversations.getOrCreateForUser(ANA);
    return { ctx, conversationId: conv.id, services };
}

interface FakeLlmOptions {
    classification?: Partial<Classification>;
    classifyError?: Error;
    respond?: (input: Parameters<LlmPort["respond"]>[0]) => Promise<string>;
}

export function fakeLlm(opts: FakeLlmOptions = {}) {
    const calls = { classify: 0, respond: 0 };
    const llm: LlmPort = {
        modelId: "fake-model",
        async classify() {
            calls.classify++;
            if (opts.classifyError) throw opts.classifyError;
            return {
                value: { intent: "faq", understood: "Dúvida de teste", confidence: 0.9, reasoning: "Teste", ...opts.classification },
                usage: { inputTokens: 100, outputTokens: 20, calls: 1 },
            };
        },
        async respond(input) {
            calls.respond++;
            const answer = (await opts.respond?.(input)) ?? "Resposta do agent.";
            return {
                text: (async function* () {
                    yield answer;
                })(),
                usage: async () => ({ inputTokens: 200, outputTokens: 40, calls: 1 }),
            };
        },
    };
    return { llm, calls };
}