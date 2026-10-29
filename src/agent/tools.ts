import { createTool } from "@mastra/core/tools";
import { askInput, proposeInput, updateInput, type TurnActions } from "./actions";
import type { ToolName } from "./guardrails";

export function buildTools(a: TurnActions) {
  return {
    askUser: createTool({
      id: "askUser",
      description:
        "Mostra botões de resposta rápida (2 a 4 opções curtas). Escreva a pergunta no texto da resposta. " +
        "Para impacto: 'Só eu', 'Minha equipe', 'Toda a empresa', 'Não sei'.",
      inputSchema: askInput,
      execute: async (input) => a.askUser(input),
    }),
    proposeTicket: createTool({
      id: "proposeTicket",
      description:
        "Monta o RASCUNHO de um chamado novo (não cria nada; o funcionário confirma). Só chame quando souber: " +
        "o que acontece, quantas pessoas são afetadas, se impede o trabalho e se há compromisso hoje; se faltar algo, " +
        "pergunte antes. INC = algo parou; REQ = pedido de acesso, equipamento ou software.",
      inputSchema: proposeInput,
      execute: async (input) => a.proposeTicket(input),
    }),
    proposeTicketUpdate: createTool({
      id: "proposeTicketUpdate",
      description:
        "Monta o RASCUNHO de um complemento (ou reabertura) em um chamado que o funcionário já tem; não grava nada. " +
        "Use no lugar de abrir outro chamado.",
      inputSchema: updateInput,
      execute: async (input) => a.proposeTicketUpdate(input),
    }),
  } satisfies Record<ToolName, unknown>;
}

/** Entrega ao modelo apenas as ferramentas liberadas para a intenção. */
export function pickTools<T extends Record<ToolName, unknown>>(all: T, names: readonly ToolName[]): Record<string, T[ToolName]> {
  return Object.fromEntries(names.map((n) => [n, all[n]]));
}