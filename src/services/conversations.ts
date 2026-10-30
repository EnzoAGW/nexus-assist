import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNotNull, lt, ne, sql } from "drizzle-orm";
import { conversations as conv, messages } from "@/db/schema";
import type { Db } from "@/db/types";
import { analystMayReply, canTransition } from "@/lib/domain/rules/conversation-state";
import type { ConversationState, MessageRole } from "@/lib/domain/model/enums";
import { pendingActionSchema, type PendingAction } from "@/lib/domain/model/schemas";
import type { DecisionTrace } from "@/lib/domain/model/trace";
import { RuleError } from "./errors";
import { createUserService, normalizeEmail } from "./users";

export type Conversation = typeof conv.$inferSelect;
export type Message = typeof messages.$inferSelect;

export interface NewMessage {
  role: MessageRole;
  content: string;
  authorEmail?: string | null;
  trace?: DecisionTrace | null;
  ui?: Record<string, unknown> | null;
}

export interface ConversationServiceOptions {
  now?: () => Date;
  maxMessagesPerSession: number;
}

export function createConversationService(db: Db, options: ConversationServiceOptions) {
  const clock = options.now ?? (() => new Date());
  const users = createUserService(db);

  // ---------- Leitura (com verificação de dono) ----------

  /** Funcionário: só enxerga a própria conversa. */
  async function getForUser(userEmail: string, id: string): Promise<Conversation | null> {
    const [row] = await db
      .select()
      .from(conv)
      .where(and(eq(conv.id, id), eq(conv.userEmail, normalizeEmail(userEmail))))
      .limit(1);
    return row ?? null;
  }

  async function loadOrThrow(id: string): Promise<Conversation> {
    const [row] = await db.select().from(conv).where(eq(conv.id, id)).limit(1);
    if (!row) throw new RuleError("not_found", "Conversa não encontrada.");
    return row;
  }

  /** Analista: lê qualquer conversa, mas só sendo analista. */
  async function getForAnalyst(analystEmail: string, id: string): Promise<Conversation> {
    await users.requireAnalyst(analystEmail);
    return loadOrThrow(id);
  }

  /** Use só depois de `getForUser` ou `getForAnalyst` ter validado o acesso. */
  async function listMessages(conversationId: string, limit = 200): Promise<Message[]> {
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt), sql`rowid desc`)
      .limit(limit);
    return rows.reverse();
  }

  // ---------- Ciclo de vida ----------

  /** História 6: a conversa continua de onde parou. Só abre outra se a anterior foi encerrada. */
  async function getOrCreateForUser(userEmail: string): Promise<Conversation> {
    const email = normalizeEmail(userEmail);
    const [existing] = await db
      .select()
      .from(conv)
      .where(and(eq(conv.userEmail, email), ne(conv.state, "closed")))
      .orderBy(desc(conv.updatedAt))
      .limit(1);
    if (existing) return existing;

    const at = clock();
    const [created] = await db
      .insert(conv)
      .values({ id: randomUUID(), userEmail: email, state: "with_agent", sessionMessageCount: 0, createdAt: at, updatedAt: at })
      .returning();
    if (!created) throw new Error("O insert não retornou a conversa criada.");
    return created;
  }

  async function addMessage(conversationId: string, input: NewMessage): Promise<Message> {
    const at = clock();
    const message: Message = {
      id: randomUUID(),
      conversationId,
      role: input.role,
      content: input.content,
      authorEmail: input.authorEmail ?? null,
      trace: input.trace ?? null,
      ui: input.ui ?? null,
      createdAt: at,
    };
    await db.batch([
      db.insert(messages).values(message),
      db.update(conv).set({ updatedAt: at }).where(eq(conv.id, conversationId)),
    ]);
    return message;
  }

  // ---------- Limite de 30 mensagens por sessão ----------

  /** Chamado no login: uma nova sessão zera o contador. */
  async function startSession(userEmail: string, id: string): Promise<void> {
    await db
      .update(conv)
      .set({ sessionMessageCount: 0 })
      .where(and(eq(conv.id, id), eq(conv.userEmail, normalizeEmail(userEmail))));
  }

  /** Incremento atômico: duas requisições simultâneas não furam o limite. */
  async function registerUserMessage(
    userEmail: string,
    id: string,
  ): Promise<{ allowed: boolean; used: number; limit: number }> {
    const limit = options.maxMessagesPerSession;
    const [row] = await db
      .update(conv)
      .set({ sessionMessageCount: sql`${conv.sessionMessageCount} + 1`, updatedAt: clock() })
      .where(and(eq(conv.id, id), eq(conv.userEmail, normalizeEmail(userEmail)), lt(conv.sessionMessageCount, limit)))
      .returning({ used: conv.sessionMessageCount });
    return row ? { allowed: true, used: row.used, limit } : { allowed: false, used: limit, limit };
  }

  // ---------- Rascunho aguardando confirmação ----------

  async function setPendingAction(userEmail: string, id: string, action: PendingAction | null): Promise<void> {
    const value = action ? pendingActionSchema.parse(action) : null;
    const rows = await db
      .update(conv)
      .set({ pendingAction: value })
      .where(and(eq(conv.id, id), eq(conv.userEmail, normalizeEmail(userEmail))))
      .returning({ id: conv.id });
    if (rows.length === 0) throw new RuleError("not_found", "Conversa não encontrada.");
  }

  /**
   * Retira o rascunho para executá-lo. Só uma chamada recebe o valor: um duplo clique em
   * "Confirmar" nunca cria dois chamados. Se a execução falhar, quem chamou usa `setPendingAction` para devolver.
   */
  async function takePendingAction(userEmail: string, id: string): Promise<PendingAction | null> {
    const email = normalizeEmail(userEmail);
    const current = await getForUser(email, id);
    if (!current?.pendingAction) return null;

    const claimed = await db
      .update(conv)
      .set({ pendingAction: null })
      .where(and(eq(conv.id, id), eq(conv.userEmail, email), isNotNull(conv.pendingAction)))
      .returning({ id: conv.id });
    if (claimed.length === 0) return null; // outra requisição chegou primeiro

    const parsed = pendingActionSchema.safeParse(current.pendingAction);
    return parsed.success ? parsed.data : null;
  }

  // ---------- Estados: agent x analista ----------

  /** Compare-and-set: só muda se a conversa ainda está no estado em que lemos. */
  async function moveState(
    current: Conversation,
    to: ConversationState,
    patch: Partial<typeof conv.$inferInsert>,
  ): Promise<Conversation> {
    if (!canTransition(current.state, to)) {
      throw new RuleError("invalid_transition", `Não é possível ir de "${current.state}" para "${to}".`);
    }
    const [row] = await db
      .update(conv)
      .set({ ...patch, state: to, updatedAt: clock() })
      .where(and(eq(conv.id, current.id), eq(conv.state, current.state)))
      .returning();
    if (!row) throw new RuleError("invalid_transition", "A conversa mudou de estado enquanto você agia.");
    return row;
  }

  function assertAssigned(current: Conversation, analystEmail: string): void {
    if (current.state === "with_analyst" && current.assignedAnalystEmail !== analystEmail) {
      throw new RuleError("not_assigned", "Esta conversa está com outro analista.");
    }
  }

  /** Transferência pedida pelo agent (ou pelo funcionário). Idempotente. */
  async function requestHandoff(
    userEmail: string,
    id: string,
    input: { reason: string; summary: string },
  ): Promise<Conversation> {
    const current = await getForUser(userEmail, id);
    if (!current) throw new RuleError("not_found", "Conversa não encontrada.");
    if (current.state === "awaiting_analyst") return current;

    const updated = await moveState(current, "awaiting_analyst", {
      handoffReason: input.reason,
      handoffSummary: input.summary,
      pendingAction: null,
    });
    await addMessage(id, {
      role: "system",
      content: `Conversa transferida para o service desk. Motivo: ${input.reason}. Resumo: ${input.summary}`,
    });
    return updated;
  }

  async function claim(analystEmail: string, id: string): Promise<Conversation> {
    const analyst = await users.requireAnalyst(analystEmail);
    const current = await loadOrThrow(id);
    const updated = await moveState(current, "with_analyst", { assignedAnalystEmail: analyst.email });
    await addMessage(id, { role: "system", content: `${analyst.name} assumiu o atendimento.` });
    return updated;
  }

  async function returnToAgent(analystEmail: string, id: string): Promise<Conversation> {
    const analyst = await users.requireAnalyst(analystEmail);
    const current = await loadOrThrow(id);
    assertAssigned(current, analyst.email);
    const updated = await moveState(current, "with_agent", {
      assignedAnalystEmail: null,
      handoffReason: null,
      handoffSummary: null,
    });
    await addMessage(id, { role: "system", content: "Atendimento devolvido ao Nexo Assist." });
    return updated;
  }

  async function close(analystEmail: string, id: string): Promise<Conversation> {
    const analyst = await users.requireAnalyst(analystEmail);
    const current = await loadOrThrow(id);
    if (current.state !== "with_analyst") {
      throw new RuleError("invalid_transition", "Só é possível encerrar uma conversa que você assumiu.");
    }
    assertAssigned(current, analyst.email);
    const updated = await moveState(current, "closed", {});
    await addMessage(id, { role: "system", content: "Atendimento encerrado." });
    return updated;
  }

  async function postAnalystMessage(analystEmail: string, id: string, content: string): Promise<Message> {
    const analyst = await users.requireAnalyst(analystEmail);
    const current = await loadOrThrow(id);
    if (!analystMayReply(current.state) || current.assignedAnalystEmail !== analyst.email) {
      throw new RuleError("not_assigned", "Assuma o atendimento antes de responder.");
    }
    return addMessage(id, { role: "analyst", content, authorEmail: analyst.email });
  }

  return {
    getForUser,
    getForAnalyst,
    getOrCreateForUser,
    listMessages,
    addMessage,
    startSession,
    registerUserMessage,
    setPendingAction,
    takePendingAction,
    requestHandoff,
    claim,
    returnToAgent,
    close,
    postAnalystMessage,
  };
}

export type ConversationService = ReturnType<typeof createConversationService>;