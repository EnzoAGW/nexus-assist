import { randomUUID } from "node:crypto";
import { db, schema } from "./client";
import { ago, ARTICLES, TICKETS, USERS } from "./seed-data";
import type { DecisionTrace } from "@/lib/domain/model/trace";
import { HANDOFF, uncertainReason } from "@/lib/domain/rules/handoff";

async function seed() {
  const now = new Date();

  // Ordem inversa das dependências.
  await db.delete(schema.messages);
  await db.delete(schema.conversations);
  await db.delete(schema.ticketUpdates);
  await db.delete(schema.tickets);
  await db.delete(schema.articles);
  await db.delete(schema.users);

  await db.insert(schema.users).values(
    USERS.map((u) => ({
      email: u.email,
      name: u.name,
      role: u.role,
      level: u.level,
      available: true,
      passwordChangedAt: ago(now, u.pwdDays),
    })),
  );

  await db.insert(schema.articles).values(ARTICLES.map((a) => ({ ...a })));

  await db.insert(schema.tickets).values(
    TICKETS.map((t) => ({
      id: t.id,
      requesterEmail: t.requesterEmail,
      title: t.title,
      description: t.description,
      type: t.type,
      category: t.category,
      priority: t.priority,
      impact: t.impact,
      status: t.status,
      createdAt: ago(now, t.createdDaysAgo),
      lastUpdatedAt: ago(now, t.updatedDaysAgo),
      resolvedAt: t.resolvedDaysAgo !== undefined ? ago(now, t.resolvedDaysAgo) : null,
    })),
  );

  // Conversa já transferida (Tela 5 do protótipo), para desenvolver o console.
  const convId = randomUUID();
  await db.insert(schema.conversations).values({
    id: convId,
    userEmail: "ana.souza@nexo.com.br",
    state: "awaiting_analyst",
    handoffSummary:
      "Ana pergunta pelo INC-20311 (notebook lento após atualização do Windows), vencido há 3 dias. Pediu para falar com um analista.",
    handoffReason: "Chamado vencido e pedido do funcionário",
    sessionMessageCount: 2,
    createdAt: ago(now, 0, 1),
    updatedAt: ago(now, 0, 0),
  });

  const trace: DecisionTrace = {
    understood: "Ana quer saber como está o chamado do notebook lento.",
    intent: "ticket_lookup",
    confidence: 0.93,
    reasoning:
      "Ela descreveu o problema sem citar o número; o chamado INC-20311 é o único dela sobre notebook e está vencido, então o agent ofereceu um analista.",
    actions: [
      {
        tool: "listMyTickets",
        label: "consultou seus chamados",
        status: "ok",
        summary: "3 chamados abertos encontrados",
        durationMs: 42,
      },
    ],
    rulesApplied: ["sla-overdue"],
    handoffReason: null,
    model: "seed",
    latencyMs: 900,
    usage: { inputTokens: 0, outputTokens: 0, llmCalls: 0 },
  };

  await db.insert(schema.messages).values([
    {
      id: randomUUID(),
      conversationId: convId,
      role: "user",
      content: "Qual o status do meu chamado do notebook?",
      authorEmail: null,
      trace: null,
      ui: null,
      createdAt: ago(now, 0, 1),
    },
    {
      id: randomUUID(),
      conversationId: convId,
      role: "agent",
      content:
        "O INC-20311 (Notebook lento após atualização do Windows) está aguardando analista e o prazo venceu há 3 dias. Quer falar com um analista?",
      authorEmail: null,
      trace,
      ui: { elements: [{ type: "ticket_card", ticketId: "INC-20311" }] },
      createdAt: ago(now, 0, 1),
    },
    {
      id: randomUUID(),
      conversationId: convId,
      role: "user",
      content: "Quero falar com um analista.",
      authorEmail: null,
      trace: null,
      ui: null,
      createdAt: ago(now, 0, 0),
    },
    {
      id: randomUUID(),
      conversationId: convId,
      role: "system",
      content: "Conversa transferida para o service desk. Resumo: " +
        "Ana pergunta pelo INC-20311, vencido há 3 dias, e pediu um analista.",
      authorEmail: null,
      trace: null,
      ui: null,
      createdAt: ago(now, 0, 0),
    },
  ]);
  const carlaConv = randomUUID();
  await db.insert(schema.conversations).values({
    id: carlaConv,
    userEmail: "carla.mendes@nexo.com.br",
    state: "awaiting_analyst",
    handoffReason: HANDOFF.critical,
    handoffSummary: "Chamado INC-20322 aberto: SAP fora do ar para o time de compras desde as 8h. Fechamento do dia parado.",
    sessionMessageCount: 3,
    createdAt: ago(now, 0, 2),
    updatedAt: ago(now, 0, 0),
  });
  await db.insert(schema.messages).values([
    { id: randomUUID(), conversationId: carlaConv, role: "user", content: "O SAP está fora do ar para o time de compras inteiro.", authorEmail: null, trace: null, ui: null, createdAt: ago(now, 0, 2) },
    {
      id: randomUUID(), conversationId: carlaConv, role: "agent", authorEmail: null, createdAt: ago(now, 0, 1),
      content: "Chamado INC-20322 aberto. Prioridade Crítica, primeira resposta em até 1 hora. Por ser crítico, já chamei um analista: ele continua o atendimento por aqui.",
      trace: {
        understood: "O SAP está parado para o time de compras.",
        intent: "confirmation",
        confidence: 1,
        reasoning: "Confirmação explícita pelo botão; o servidor criou o chamado e, por ser crítico, transferiu para um analista.",
        actions: [{ tool: "createTicket", label: "criou o chamado", status: "ok", summary: "INC-20322 (Crítica)", durationMs: 41 }],
        rulesApplied: ["group-blocked", "explicit-confirmation", "critical-handoff"],
        handoffReason: HANDOFF.critical,
        model: "seed",
        latencyMs: 120,
        usage: { inputTokens: 0, outputTokens: 0, llmCalls: 0 },
      },
      ui: { elements: [{ type: "ticket_card", ticketId: "INC-20322" }] },
    },
    { id: randomUUID(), conversationId: carlaConv, role: "system", content: `Conversa transferida para o service desk. Motivo: ${HANDOFF.critical}.`, authorEmail: null, trace: null, ui: null, createdAt: ago(now, 0, 0) },
  ]);

  // Elisa: pediu um analista e a Marina já assumiu (aparece em "Minhas" para a Marina).
  const elisaConv = randomUUID();
  await db.insert(schema.conversations).values({
    id: elisaConv,
    userEmail: "elisa.prado@nexo.com.br",
    state: "with_analyst",
    assignedAnalystEmail: "marina.costa@nexo.com.br",
    handoffReason: HANDOFF.requested,
    handoffSummary: "Elisa pergunta quando o monitor novo chega.",
    sessionMessageCount: 2,
    createdAt: ago(now, 0, 3),
    updatedAt: ago(now, 0, 0),
  });

  await db.insert(schema.messages).values([
    { id: randomUUID(), conversationId: elisaConv, role: "user", content: "Quero falar com um analista sobre o meu monitor novo.", authorEmail: null, trace: null, ui: null, createdAt: ago(now, 0, 3) },
    { id: randomUUID(), conversationId: elisaConv, role: "system", content: `Conversa transferida para o service desk. Motivo: ${HANDOFF.requested}.`, authorEmail: null, trace: null, ui: null, createdAt: ago(now, 0, 3) },
    { id: randomUUID(), conversationId: elisaConv, role: "system", content: "Marina Costa assumiu o atendimento.", authorEmail: null, trace: null, ui: null, createdAt: ago(now, 0, 2) },
    { id: randomUUID(), conversationId: elisaConv, role: "analyst", content: "Oi, Elisa! Vou verificar com o estoque e te aviso por aqui.", authorEmail: "marina.costa@nexo.com.br", trace: null, ui: null, createdAt: ago(now, 0, 1) },
  ]);

  // Gabriela: o agent não teve segurança e transferiu (marcador "Agent sem segurança").
  const gabrielaConv = randomUUID();
  const uncertain = uncertainReason(0.31);
  await db.insert(schema.conversations).values({
    id: gabrielaConv,
    userEmail: "gabriela.rocha@nexo.com.br",
    state: "awaiting_analyst",
    handoffReason: uncertain,
    handoffSummary: 'Não foi possível interpretar a mensagem. Últimas mensagens do funcionário: "aquilo lá de novo" | "sabe, o negócio da outra vez"',
    sessionMessageCount: 2,
    createdAt: ago(now, 0, 1),
    updatedAt: ago(now, 0, 0),
  });

  await db.insert(schema.messages).values([
    { id: randomUUID(), conversationId: gabrielaConv, role: "user", content: "aquilo lá de novo", authorEmail: null, trace: null, ui: null, createdAt: ago(now, 0, 1) },
    { id: randomUUID(), conversationId: gabrielaConv, role: "user", content: "sabe, o negócio da outra vez", authorEmail: null, trace: null, ui: null, createdAt: ago(now, 0, 1) },
    {
      id: randomUUID(), conversationId: gabrielaConv, role: "agent", authorEmail: null, createdAt: ago(now, 0, 0),
      content: "Não tenho segurança para resolver isso sozinho, então vou passar para um analista do service desk. Ele recebe o resumo da conversa e continua por aqui.",
      trace: {
        understood: "Não foi possível interpretar a mensagem.",
        intent: "clarification",
        confidence: 0.31,
        reasoning: "A mensagem não cita problema, equipamento ou sistema, e o histórico não esclarece a que ela se refere.",
        actions: [
          { tool: "classifyIntent", label: "entendeu o pedido", status: "ok", summary: "Falta informação (31% de certeza)", durationMs: 610 },
          { tool: "requestHandoff", label: "transferiu para um analista", status: "ok", summary: uncertain, durationMs: 0 },
        ],
        rulesApplied: ["low-confidence"],
        handoffReason: uncertain,
        model: "seed",
        latencyMs: 700,
        usage: { inputTokens: 0, outputTokens: 0, llmCalls: 0 },
      },
      ui: null,
    },
    { id: randomUUID(), conversationId: gabrielaConv, role: "system", content: `Conversa transferida para o service desk. Motivo: ${uncertain}.`, authorEmail: null, trace: null, ui: null, createdAt: ago(now, 0, 0) },
  ]);

  console.log(`Seed ok: ${USERS.length} usuários, ${ARTICLES.length} artigos, ${TICKETS.length} chamados, 3 conversas.`);
}

seed().catch((err) => {
  console.error("Falha no seed:", err);
  process.exit(1);
});