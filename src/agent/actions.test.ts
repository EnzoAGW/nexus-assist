import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { articles } from "@/db/schema";
import { ARTICLES } from "@/db/seed-data";
import { createTestDb, insertTicket, insertUser, type TestDb } from "@/db/test-utils";
import { createConversationService } from "@/services/conversations";
import { createKnowledgeBaseService } from "@/services/knowledge-base";
import type { ResilienceOptions } from "@/services/legacy";
import { createTicketService } from "@/services/tickets";
import { createTurnActions } from "./actions";
import { createRecorder } from "./turn";

const NOW = new Date("2026-10-28T15:00:00-03:00");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
const ANA = "ana.souza@nexo.com.br";
const CARLA = "carla.mendes@nexo.com.br";

const resilience = (failureRate = 0): ResilienceOptions => ({
  failureRate,
  maxAttempts: 2,
  baseDelayMs: 0,
  random: () => 0.5,
  sleep: async () => { },
});

let ctx: TestDb;
let conversationId: string;

async function setup(failureRate = 0) {
  const services = {
    tickets: createTicketService(ctx.db, { now: () => NOW, resilience: resilience(failureRate) }),
    knowledgeBase: createKnowledgeBaseService(ctx.db),
    conversations: createConversationService(ctx.db, { maxMessagesPerSession: 30, now: () => NOW }),
  };
  const recorder = createRecorder();
  const actions = createTurnActions({ userEmail: ANA, conversationId, services, recorder, now: () => NOW });
  return { actions, recorder, services };
}

const proposal = {
  title: "Teclado com teclas falhando",
  description: "Algumas teclas do teclado pararam de responder durante o uso.",
  type: "INC",
  category: "Hardware",
  impact: "single",
  blocksWork: false,
  deadlineToday: false,
} as const;

beforeEach(async () => {
  ctx = await createTestDb();
  await insertUser(ctx.db, { email: ANA, name: "Ana Souza" });
  await insertUser(ctx.db, { email: CARLA, name: "Carla Mendes" });
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
  const conversations = createConversationService(ctx.db, { maxMessagesPerSession: 30 });
  conversationId = (await conversations.getOrCreateForUser(ANA)).id;
});

afterEach(async () => {
  await ctx.cleanup();
});

describe("proposeTicket", () => {
  it("a prioridade vem do código e nada é criado: só o rascunho pendente", async () => {
    const { actions, recorder, services } = await setup();
    const result = await actions.proposeTicket({ ...proposal, blocksWork: true });

    expect(result).toMatchObject({ status: "draft_ready", priority: "Alta" });
    expect(recorder.rules.has("person-blocked")).toBe(true);
    expect(recorder.ui.map((u) => u.type)).toEqual(["draft"]);
    expect(await services.tickets.listForUser(ANA)).toHaveLength(3); // nenhum chamado novo

    const conv = await services.conversations.getForUser(ANA, conversationId);
    expect(conv?.pendingAction).toMatchObject({ kind: "create_ticket", draft: { priority: "high" } });
  });

  it("equipe parada vira crítica e marca a transferência pós-confirmação", async () => {
    const { actions, recorder } = await setup();
    const result = await actions.proposeTicket({ ...proposal, impact: "team", blocksWork: true });
    expect(result).toMatchObject({ priority: "Crítica" });
    expect(recorder.rules.has("critical-handoff-after-confirm")).toBe(true);
  });

  it("problema já aberto: devolve 'duplicate' e não cria rascunho", async () => {
    const { actions, services } = await setup();
    const result = await actions.proposeTicket({
      ...proposal,
      title: "Notebook muito lento depois da atualização do Windows",
    });
    expect(result).toMatchObject({ status: "duplicate", existing: { id: "INC-20311" } });
    const conv = await services.conversations.getForUser(ANA, conversationId);
    expect(conv?.pendingAction).toBeNull();
  });
});

describe("proposeTicketUpdate", () => {
  it("chamado de outra pessoa é 'not_found' e não gera rascunho", async () => {
    const { actions, services } = await setup();
    expect(await actions.proposeTicketUpdate({ ticketId: "INC-20305", note: "Também comigo" })).toMatchObject({
      status: "not_found",
    });
    expect((await services.conversations.getForUser(ANA, conversationId))?.pendingAction).toBeNull();
  });

  it("resolvido há 4 dias: prepara reabertura", async () => {
    const { actions, services } = await setup();
    expect(await actions.proposeTicketUpdate({ ticketId: "INC-20150", note: "Bloqueou de novo." })).toMatchObject({
      status: "draft_ready",
      reopen: true,
    });
    const conv = await services.conversations.getForUser(ANA, conversationId);
    expect(conv?.pendingAction).toMatchObject({ kind: "update_ticket", ticketId: "INC-20150", reopen: true });
  });

  it("resolvido há 9 dias: não reabre e orienta chamado novo", async () => {
    const { actions } = await setup();
    expect(await actions.proposeTicketUpdate({ ticketId: "INC-20044", note: "Voltou." })).toMatchObject({
      status: "cannot_reopen",
    });
  });
});

describe("consulta", () => {
  it("chamado vencido oferece o analista e registra a regra", async () => {
    const { actions, recorder } = await setup();
    await actions.getTicket({ ticketId: "INC-20311" });
    expect(recorder.rules.has("sla-overdue")).toBe(true);
    const quick = recorder.ui.find((u) => u.type === "quick_replies");
    expect(quick && quick.type === "quick_replies" && quick.options).toContain("Falar com um analista");
  });

  it("chamado alheio é indistinguível de inexistente", async () => {
    const { actions } = await setup();
    const other = await actions.getTicket({ ticketId: "INC-20305" });
    const missing = await actions.getTicket({ ticketId: "INC-99999" });
    expect(other).toEqual(missing);
    expect(other).toMatchObject({ found: false });
  });
  it("um único chamado: mostra o card dele em vez de uma lista", async () => {
    const { services } = await setup();
    const recorder = createRecorder();
    const carla = createTurnActions({ userEmail: CARLA, conversationId, services, recorder, now: () => NOW });
    await carla.listMyTickets({}, { showCards: true });
    expect(recorder.ui).toEqual([{ type: "ticket_card", ticketId: "INC-20305" }]);
  });
  it("lista só os chamados do usuário", async () => {
    const { actions } = await setup();
    const result = await actions.listMyTickets({});
    expect(result.count).toBe(3);
  });
});

describe("central de ajuda e resiliência", () => {
  it("sem artigo relevante, o resultado proíbe inventar resposta", async () => {
    const { actions, recorder } = await setup();
    expect(await actions.searchKnowledgeBase({ query: "receita de bolo de cenoura" })).toMatchObject({ found: false });
    expect(recorder.rules.has("kb-no-match")).toBe(true);
  });

  it("legado fora: o modelo recebe 'unavailable', o trace registra o erro e nada explode", async () => {
    const { actions, recorder } = await setup(1);
    expect(await actions.listMyTickets({})).toMatchObject({ status: "unavailable" });
    expect(recorder.actions[0]).toMatchObject({ tool: "listMyTickets", status: "error" });
    expect(recorder.rules.has("legacy-unavailable")).toBe(true);
  });
});