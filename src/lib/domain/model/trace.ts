import { z } from "zod";

export const INTENTS = [
  "faq",
  "ticket_lookup",
  "ticket_create",
  "ticket_update",
  "handoff_request",
  "out_of_scope",
  "clarification",
  "confirmation",
  "smalltalk",
] as const;
export type Intent = (typeof INTENTS)[number];

export const INTENT_LABEL: Record<Intent, string> = {
  faq: "Dúvida (central de ajuda)",
  ticket_lookup: "Consulta de chamado",
  ticket_create: "Abertura de chamado",
  ticket_update: "Atualização de chamado",
  handoff_request: "Pedido de analista",
  out_of_scope: "Fora do escopo de TI",
  clarification: "Falta informação",
  confirmation: "Confirmação do rascunho",
  smalltalk: "Conversa geral",
};

export const traceActionSchema = z.object({
  /** Nome técnico da tool, ex.: "searchKnowledgeBase". */
  tool: z.string(),
  /** Texto do chip acima da resposta, ex.: "consultou seus chamados". */
  label: z.string(),
  status: z.enum(["ok", "error"]),
  /** Resumo legível do resultado, ex.: "3 chamados abertos". */
  summary: z.string(),
  durationMs: z.number().nonnegative(),
});
export type TraceAction = z.infer<typeof traceActionSchema>;

export const decisionTraceSchema = z.object({
  /** O que o agent entendeu do pedido, em uma frase. */
  understood: z.string(),
  intent: z.enum(INTENTS),
  /** 0 a 1. Abaixo do limiar, o agent transfere para um analista. */
  confidence: z.number().min(0).max(1),
  /** Por que o agent escolheu esta resposta/ação. */
  reasoning: z.string(),
  actions: z.array(traceActionSchema),
  /** Regras determinísticas aplicadas (ex.: "person-blocked", "duplicate-check"). */
  rulesApplied: z.array(z.string()),
  /** Preenchido quando a resposta resultou em transferência. */
  handoffReason: z.string().nullable(),
  model: z.string(),
  latencyMs: z.number().nonnegative(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    /** Quantas chamadas ao modelo o turno fez. */
    llmCalls: z.number().int().nonnegative(),
  }),
});

export type DecisionTrace = z.infer<typeof decisionTraceSchema>;