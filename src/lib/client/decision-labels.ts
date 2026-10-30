import { CONFIDENCE_THRESHOLD, CONFIRM_THRESHOLD } from "@/lib/domain/rules/confidence";

const RULE_LABEL: Record<string, string> = {
    "owner-scoped-query": "Consulta limitada aos chamados do próprio funcionário",
    "sla-overdue": "Prazo do chamado vencido",
    "duplicate-check": "Verificou chamados parecidos antes de abrir um novo",
    "kb-no-match": "Nenhum artigo relevante na central de ajuda",
    "reopen-window-7d": "Regra dos 7 dias para reabrir chamado resolvido",
    "critical-handoff-after-confirm": "Caso crítico: será transferido a um analista após a confirmação",
    "critical-handoff": "Caso crítico: transferido a um analista",
    "explicit-confirmation": "Ação executada só após confirmação explícita",
    "explicit-confirmation-typed": "Confirmação digitada, aceita com alta confiança",
    "explicit-cancel": "Rascunho cancelado pelo funcionário",
    "confirm-needs-button": "Confirmação incerta: pediu para usar o botão",
    "out-of-scope-redirect": "Assunto fora de TI: redirecionado",
    "low-confidence": "Confiança baixa: transferido para um analista",
    "user-requested-handoff": "O funcionário pediu um analista",
    "legacy-unavailable": "Sistema de chamados indisponível",
    "llm-unavailable": "Modelo sem resposta (limite de uso)",
    "group-blocked": "Algo parado para uma equipe ou a empresa",
    "person-blocked": "Impede uma pessoa de trabalhar",
    "same-day-commitment": "Há um compromisso no mesmo dia",
    "incident-with-workaround": "Incidente com alternativa",
    "request-no-urgency": "Pedido sem urgência",
};

/** Regra desconhecida aparece pelo próprio id: melhor técnico do que escondido. */
export const ruleLabel = (id: string): string => RULE_LABEL[id] ?? id;

export type ConfidenceLevel = "high" | "medium" | "low";

export const confidenceLevel = (c: number): ConfidenceLevel =>
    c >= CONFIRM_THRESHOLD ? "high" : c >= CONFIDENCE_THRESHOLD ? "medium" : "low";

export const CONFIDENCE_TEXT: Record<ConfidenceLevel, string> = { high: "Alta", medium: "Média", low: "Baixa" };