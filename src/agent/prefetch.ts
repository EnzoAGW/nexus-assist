import type { Intent } from "@/lib/domain/trace";
import type { TurnActions } from "./actions";

export type PrefetchStep =
  | { kind: "kb"; query: string }
  | { kind: "list"; showCards: boolean }
  | { kind: "get"; ticketId: string };
export interface PrefetchResult {
  step: PrefetchStep;
  result: Record<string, unknown>;
}

const TICKET_ID = /\b(?:INC|REQ)-\d{3,}\b/i;

/** Decide, em código, o que consultar antes de chamar o modelo. */
export function planPrefetch(intent: Intent, text: string, understood: string): PrefetchStep[] {
  const ticketId = TICKET_ID.exec(text)?.[0]?.toUpperCase();

  switch (intent) {
    case "faq":
      return [{ kind: "kb", query: text }];
    case "ticket_create":
      // Sempre olha a central (a dúvida pode se resolver sozinha) e os chamados (para não duplicar).
      return [{ kind: "kb", query: `${text} ${understood}` }, { kind: "list", showCards: false }];
    case "ticket_lookup":
    case "ticket_update":
      return ticketId ? [{ kind: "get", ticketId }] : [{ kind: "list", showCards: true }]; default:
      return [];
  }
}

/** Sequencial: a ordem dos chips no trace é sempre a mesma. */
export async function runPrefetch(actions: TurnActions, steps: readonly PrefetchStep[]): Promise<PrefetchResult[]> {
  const results: PrefetchResult[] = [];
  for (const step of steps) {
    const result =
      step.kind === "kb"
        ? await actions.searchKnowledgeBase({ query: step.query })
        : step.kind === "list"
          ? await actions.listMyTickets({}, { showCards: step.showCards })
          : await actions.getTicket({ ticketId: step.ticketId });
    results.push({ step, result });
  }
  return results;
}

const LABEL: Record<PrefetchStep["kind"], string> = {
  kb: "Central de ajuda",
  list: "Chamados do funcionário",
  get: "Chamado consultado",
};

const MAX_CONTEXT_CHARS = 3500;

/** JSON compacto: simples, sem formatação frágil, e limitado para não estourar a cota de tokens. */
export function renderContext(results: readonly PrefetchResult[]): string {
  return results
    .map(({ step, result }) => `${LABEL[step.kind]}: ${JSON.stringify(result)}`)
    .join("\n")
    .slice(0, MAX_CONTEXT_CHARS);
}