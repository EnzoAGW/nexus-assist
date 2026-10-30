export const HANDOFF = {
    requested: "Pedido do funcionário",
    critical: "Chamado crítico: prazo de primeira resposta de 1 hora",
    uncertainPrefix: "O agent não teve segurança para decidir",
} as const;

export type HandoffKind = "requested" | "critical" | "uncertain" | "other";

export const HANDOFF_KIND_LABEL: Record<HandoffKind, string> = {
    requested: "Pediu um analista",
    critical: "Chamado crítico",
    uncertain: "Agent sem segurança",
    other: "Transferida",
};

export const uncertainReason = (confidence: number): string =>
    `${HANDOFF.uncertainPrefix} (confiança ${confidence.toFixed(2)})`;

export function handoffKind(reason: string | null): HandoffKind | null {
    if (!reason) return null;
    if (reason === HANDOFF.requested) return "requested";
    if (reason === HANDOFF.critical) return "critical";
    if (reason.startsWith(HANDOFF.uncertainPrefix)) return "uncertain";
    return "other";
}