import { agentMayReply } from "@/lib/domain/conversation-state";
import type { ConversationState } from "@/lib/domain/enums";
import { INTENT_LABEL, type DecisionTrace, type TraceAction } from "@/lib/domain/trace";
import type { Services } from "@/services";
import type { Message } from "@/services/conversations";
import { RuleError, TicketSystemUnavailableError } from "@/services/errors";
import { createTurnActions } from "./actions";
import { UNPARSEABLE, type Classification } from "./classification";
import { TICKETS_DOWN_TEXT, executePending } from "./confirm";
import { routeMessage } from "./guardrails";
import { buildHandoffSummary, toChatHistory } from "./history";
import { addUsage, LlmUnavailableError, NO_USAGE, type LlmPort, type LlmUsage } from "./llm";
import { createRecorder, type UiElement } from "./turn";
import { planPrefetch, renderContext, runPrefetch } from "./prefetch"
export const HISTORY_WINDOW = 10;

export interface RunTurnDeps {
  llm: LlmPort;
  services: Pick<Services, "tickets" | "knowledgeBase" | "conversations">;
  now?: () => Date;
}

export interface RunTurnInput {
  userEmail: string;
  conversationId: string;
  text: string;
}

export type TurnEvent =
  | { type: "user_message"; message: Message }
  | { type: "text"; delta: string }
  /** Mensagem final já gravada. O cliente troca o texto transmitido por esta (conteúdo, trace e UI oficiais). */
  | { type: "agent_message"; message: Message }
  | { type: "blocked"; reason: "session_limit"; used: number; limit: number }
  | { type: "paused"; state: ConversationState };

const TEXT = {
  outOfScope:
    "Eu só consigo ajudar com assuntos de TI (acessos, equipamentos, software, rede e e-mail). Para RH, financeiro ou facilities, procure o canal responsável. Posso ajudar com alguma questão de TI?",
  handoffRequested:
    "Claro! Estou transferindo você para um analista do service desk. Ele recebe o resumo da nossa conversa, então você não precisa repetir tudo. Aguarde por aqui.",
  handoffUncertain:
    "Não tenho segurança para resolver isso sozinho, então vou passar para um analista do service desk. Ele recebe o resumo da conversa e continua por aqui.",
  useButtons: "Para eu criar ou atualizar o chamado, use os botões Confirmar ou Cancelar no rascunho acima.",
  llmDown:
    "Estou com muitas solicitações agora e não consegui responder. Tente de novo em instantes ou, se preferir, posso chamar um analista.",
  ticketsDown:
    "O sistema de chamados está instável e não consegui concluir agora. Seu rascunho continua salvo: tente confirmar de novo em instantes.",
  emptyAnswer: "Não consegui formular uma resposta. Pode reformular, por favor?",
  draftReady: "Preparei o rascunho acima. Posso confirmar?",
} as const;

const UNAVAILABLE_CLASSIFICATION: Classification = {
  ...UNPARSEABLE,
  understood: "Não foi possível interpretar a mensagem (modelo indisponível).",
  reasoning: "O modelo não respondeu: limite de uso ou indisponibilidade do provedor.",
};

export async function* runTurn(deps: RunTurnDeps, input: RunTurnInput): AsyncGenerator<TurnEvent, void, void> {
  const { llm, services } = deps;
  const { userEmail } = input;
  const started = performance.now();
  const text = input.text.trim();

  const conv = await services.conversations.getForUser(userEmail, input.conversationId);
  if (!conv) throw new RuleError("not_found", "Conversa não encontrada.");

  // 1. Com um analista (ou na fila), o agent não responde. A mensagem só é registrada.
  if (!agentMayReply(conv.state)) {
    yield { type: "user_message", message: await services.conversations.addMessage(conv.id, { role: "user", content: text }) };
    yield { type: "paused", state: conv.state };
    return;
  }

  // 2. Limite de mensagens por sessão (protege o custo).
  const quota = await services.conversations.registerUserMessage(userEmail, conv.id);
  if (!quota.allowed) {
    yield { type: "blocked", reason: "session_limit", used: quota.used, limit: quota.limit };
    return;
  }

  yield { type: "user_message", message: await services.conversations.addMessage(conv.id, { role: "user", content: text }) };
  const history = toChatHistory(await services.conversations.listMessages(conv.id, HISTORY_WINDOW));
  const hasPendingAction = conv.pendingAction !== null;

  let classification: Classification = UNAVAILABLE_CLASSIFICATION;
  let usage: LlmUsage = NO_USAGE;
  let classifyAction: TraceAction | null = null;

  const buildTrace = (p: { actions: TraceAction[]; rules: string[]; handoffReason: string | null }): DecisionTrace => ({
    understood: classification.understood,
    intent: classification.intent,
    confidence: classification.confidence,
    reasoning: classification.reasoning,
    actions: classifyAction ? [classifyAction, ...p.actions] : p.actions,
    rulesApplied: [...new Set(p.rules)],
    handoffReason: p.handoffReason,
    model: llm.modelId,
    latencyMs: Math.round(performance.now() - started),
    usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, llmCalls: usage.calls },
  });

  const reply = (p: { text: string; ui?: UiElement[]; actions?: TraceAction[]; rules: string[]; handoffReason?: string | null }) =>
    services.conversations.addMessage(conv.id, {
      role: "agent",
      content: p.text,
      trace: buildTrace({ actions: p.actions ?? [], rules: p.rules, handoffReason: p.handoffReason ?? null }),
      ui: p.ui && p.ui.length > 0 ? { elements: p.ui } : null,
    });

  // 3. Classificar
  const classifyStarted = performance.now();

  try {
    const r = await llm.classify({ history, hasPendingAction });
    classification = r.value;
    usage = r.usage;
    classifyAction = {
      tool: "classifyIntent",
      label: "entendeu o pedido",
      status: "ok",
      summary: `${INTENT_LABEL[classification.intent]} (${Math.round(classification.confidence * 100)}% de certeza)`,
      durationMs: Math.round(performance.now() - classifyStarted),
    };
  } catch (err) {
    if (!(err instanceof LlmUnavailableError)) throw err;
    yield { type: "text", delta: TEXT.llmDown };
    yield {
      type: "agent_message",
      message: await reply({
        text: TEXT.llmDown,
        ui: [{ type: "quick_replies", options: ["Falar com um analista"] }],
        rules: ["llm-unavailable"],
      }),
    };
    return;
  }

  // 4. Rotear (código, não modelo)
  const route = routeMessage(classification, { hasPendingAction });

  if (route.kind === "handoff") {
    await services.conversations.requestHandoff(userEmail, conv.id, {
      reason: route.reason,
      summary: buildHandoffSummary(history, classification.understood),
    });
    const answer = route.ruleId === "low-confidence" ? TEXT.handoffUncertain : TEXT.handoffRequested;
    yield { type: "text", delta: answer };
    yield {
      type: "agent_message",
      message: await reply({
        text: answer,
        actions: [{ tool: "requestHandoff", label: "transferiu para um analista", status: "ok", summary: route.reason, durationMs: 0 }],
        rules: [route.ruleId],
        handoffReason: route.reason,
      }),
    };
    return;
  }

  if (route.kind === "out_of_scope") {
    yield { type: "text", delta: TEXT.outOfScope };
    yield { type: "agent_message", message: await reply({ text: TEXT.outOfScope, rules: ["out-of-scope-redirect"] }) };
    return;
  }

  if (route.kind === "use_buttons") {
    yield { type: "text", delta: TEXT.useButtons };
    yield { type: "agent_message", message: await reply({ text: TEXT.useButtons, rules: ["confirm-needs-button"] }) };
    return;
  }

  if (route.kind === "confirm") {
    try {
      const r = await executePending(services, userEmail, conv.id);
      yield { type: "text", delta: r.text };
      yield {
        type: "agent_message",
        message: await reply({
          text: r.text,
          ui: r.ui,
          actions: r.actions,
          rules: ["explicit-confirmation-typed", ...r.rules],
          handoffReason: r.handoffReason,
        }),
      };
    } catch (err) {
      if (!(err instanceof TicketSystemUnavailableError)) throw err;
      yield { type: "text", delta: TICKETS_DOWN_TEXT };
      yield { type: "agent_message", message: await reply({ text: TICKETS_DOWN_TEXT, rules: ["legacy-unavailable"] }) };
    }
    return;
  }

  // 5. Agent com as ferramentas da intenção
  const recorder = createRecorder();
  const actions = createTurnActions({ userEmail, conversationId: conv.id, services, recorder, now: deps.now });
  const prefetched = await runPrefetch(actions, planPrefetch(classification.intent, text, classification.understood));
  let answer = "";
  try {
    const r = await llm.respond({
      history,
      intent: classification.intent,
      toolset: route.toolset,
      actions,
      context: renderContext(prefetched),
    });
    for await (const delta of r.text) {
      answer += delta;
      yield { type: "text", delta };
    }
    usage = addUsage(usage, await r.usage());
  } catch (err) {
    if (!(err instanceof LlmUnavailableError)) throw err;
    yield { type: "text", delta: TEXT.llmDown };
    yield {
      type: "agent_message",
      message: await reply({
        text: TEXT.llmDown,
        ui: [{ type: "quick_replies", options: ["Falar com um analista"] }],
        actions: recorder.actions,
        rules: ["llm-unavailable", ...recorder.rules],
      }),
    };
    return;
  }

  if (answer.trim() === "") {
    answer = recorder.ui.some((u) => u.type === "draft" || u.type === "update_draft") ? TEXT.draftReady : TEXT.emptyAnswer;
    yield { type: "text", delta: answer };
  }

  // 6. Gravar mensagem com trace
  yield {
    type: "agent_message",
    message: await reply({ text: answer.trim(), ui: recorder.ui, actions: recorder.actions, rules: [...recorder.rules] }),
  };
}