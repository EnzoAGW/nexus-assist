import { z } from "zod";
import { findDuplicates } from "@/lib/domain/duplicates";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/lib/domain/enums";
import { derivePriority } from "@/lib/domain/priority";
import {
  categorySchema,
  impactSchema,
  ticketDraftSchema,
  ticketTypeSchema,
} from "@/lib/domain/schemas";
import { formatDateTime } from "@/lib/domain/format";
import { computeDueAt } from "@/lib/domain/sla";
import type { Services } from "@/services";
import { TicketSystemUnavailableError } from "@/services/errors";
import type { TicketView } from "@/services/tickets";
import type { TurnRecorder } from "./turn";
// ---------- Schemas de entrada (compartilhados com as tools do Mastra) ----------

export const searchInput = z.object({ query: z.string().min(2).max(300) });
export const listInput = z.object({ onlyActive: z.boolean().optional() });
export const getInput = z.object({ ticketId: z.string().min(3).max(20) });
export const askInput = z.object({ options: z.array(z.string().min(1).max(40)).min(2).max(4) });
export const proposeInput = z.object({
  title: z.string().min(5).max(120),
  description: z.string().min(20).max(2000),
  type: ticketTypeSchema,
  category: categorySchema,
  impact: impactSchema,
  blocksWork: z.boolean(),
  deadlineToday: z.boolean(),
});
export const updateInput = z.object({ ticketId: z.string().min(3).max(20), note: z.string().min(1).max(2000) });

// ---------- Dependências do turno ----------

export interface TurnDeps {
  /** Vem da sessão, validada no servidor. O LLM nunca escolhe nem vê outro e-mail. */
  userEmail: string;
  conversationId: string;
  services: Pick<Services, "tickets" | "knowledgeBase" | "conversations">;
  recorder: TurnRecorder;
  now?: () => Date;
}

type ToolResult = Record<string, unknown>;

const summarize = (t: TicketView) => ({
  id: t.id,
  title: t.title,
  type: t.type,
  category: t.category,
  priority: PRIORITY_LABEL[t.priority],
  status: STATUS_LABEL[t.status],
  dueAt: formatDateTime(t.dueAt),
  overdue: t.overdue,
  reopenable: t.reopenable,
});

const UNAVAILABLE: ToolResult = {
  status: "unavailable",
  message: "O sistema de chamados está instável agora. Avise o funcionário e ofereça falar com um analista.",
};

const OFFER_ANALYST = ["Falar com um analista", "Adicionar informações", "Não, obrigado"];

export function createTurnActions(deps: TurnDeps) {
  const { userEmail, conversationId, services, recorder } = deps;
  const clock = deps.now ?? (() => new Date());

  /** Se o sistema legado estiver fora, o modelo recebe um resultado estruturado, não uma exceção. */
  async function guarded(
    tool: string,
    label: string,
    fn: () => Promise<{ value: ToolResult; summary: string }>,
  ): Promise<ToolResult> {
    try {
      return await recorder.track<ToolResult>(tool, label, fn);
    } catch (err) {
      if (err instanceof TicketSystemUnavailableError) {
        recorder.rules.add("legacy-unavailable");
        return UNAVAILABLE;
      }
      throw err;
    }
  }

  async function searchKnowledgeBase(input: z.infer<typeof searchInput>): Promise<ToolResult> {
    return recorder.track<ToolResult>("searchKnowledgeBase", "buscou na central de ajuda", async () => {
      const hits = await services.knowledgeBase.search(input.query);
      if (hits.length === 0) {
        recorder.rules.add("kb-no-match");
        return {
          value: { found: false, message: "Nenhum artigo relevante. Não invente: ofereça abrir um chamado." },
          summary: "nenhum artigo relevante",
        };
      }
      return {
        value: {
          found: true,
          articles: hits.map((h) => ({ id: h.article.id, title: h.article.title, content: h.article.content })),
        },
        summary: `${hits.length} artigo(s): ${hits.map((h) => h.article.title).join("; ")}`,
      };
    });
  }
  async function listMyTickets(
    input: z.infer<typeof listInput>,
    opts: { showCards?: boolean } = {},
  ): Promise<ToolResult> {
    return guarded("listMyTickets", "consultou seus chamados", async () => {
      const list = await services.tickets.listForUser(userEmail, { onlyActive: input.onlyActive ?? false });
      recorder.rules.add("owner-scoped-query");
    if (opts.showCards) {
        if (opts.showCards && list.some((t) => t.overdue)) recorder.rules.add("sla-overdue");
        if (list.length > 1) {
          recorder.ui.push({ type: "ticket_list", ticketIds: list.map((t) => t.id) });
        } else if (list.length === 1) {
          const only = list[0]!;
          recorder.ui.push({ type: "ticket_card", ticketId: only.id });
          if (only.overdue) recorder.ui.push({ type: "quick_replies", options: OFFER_ANALYST });
        }
      }

      const overdue = list.filter((t) => t.overdue).length;
      return {
        value: { count: list.length, tickets: list.map(summarize) },
        summary: `${list.length} chamado(s)${overdue ? `, ${overdue} vencido(s)` : ""}`,
      };
    });
  }

  async function getTicket(input: z.infer<typeof getInput>): Promise<ToolResult> {
    return guarded("getTicket", "abriu o chamado", async () => {
      const ticket = await services.tickets.getForUser(userEmail, input.ticketId);
      recorder.rules.add("owner-scoped-query");
      if (!ticket) {
        // Mesma resposta para "não existe" e "é de outra pessoa".
        return {
          value: { found: false, message: "Não encontrei esse chamado entre os chamados do funcionário." },
          summary: "não encontrado entre os seus chamados",
        };
      }
      recorder.ui.push({ type: "ticket_card", ticketId: ticket.id });
      if (ticket.overdue) {
        recorder.rules.add("sla-overdue");
        recorder.ui.push({ type: "quick_replies", options: OFFER_ANALYST });
      }
      return {
        value: {
          found: true,
          ticket: summarize(ticket),
          note: ticket.overdue ? "Prazo vencido: reconheça o atraso e ofereça um analista." : undefined,
        },
        summary: `${ticket.id}: ${STATUS_LABEL[ticket.status]}${ticket.overdue ? ", prazo vencido" : ""}`,
      };
    });
  }

  async function askUser(input: z.infer<typeof askInput>): Promise<ToolResult> {
    return recorder.track<ToolResult>("askUser", "ofereceu opções rápidas", async () => {
      recorder.ui.push({ type: "quick_replies", options: input.options });
      return { value: { shown: true }, summary: input.options.join(" / ") };
    });
  }

  async function proposeTicket(input: z.infer<typeof proposeInput>): Promise<ToolResult> {
    return guarded("proposeTicket", "classificou a prioridade", async () => {
      const at = clock();

      // A prioridade é decidida pelo CÓDIGO. O modelo só informou as respostas do funcionário.
      const { priority, reason, ruleId } = derivePriority({
        type: input.type,
        impact: input.impact,
        blocksWork: input.blocksWork,
        deadlineToday: input.deadlineToday,
      });
      recorder.rules.add(ruleId);

      const parsed = ticketDraftSchema.safeParse({
        title: input.title,
        description: input.description,
        type: input.type,
        category: input.category,
        priority,
        impact: input.impact,
      });
      if (!parsed.success) {
        return {
          value: { status: "invalid", problems: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
          summary: "rascunho inválido",
        };
      }
      const draft = parsed.data;

      // Sem duplicidade: se já existe chamado sobre o mesmo problema, o caminho é atualizar.
      const mine = await services.tickets.listForUser(userEmail);
      recorder.rules.add("duplicate-check");
      const [duplicate] = findDuplicates(draft, mine, at);
      if (duplicate) {
        return {
          value: {
            status: "duplicate",
            existing: summarize(duplicate.ticket),
            suggestedAction: duplicate.action === "reopen" ? "reabrir" : "atualizar",
            instruction: "NÃO abra chamado novo. Use proposeTicketUpdate com este ticketId.",
          },
          summary: `já existe ${duplicate.ticket.id} (${Math.round(duplicate.score * 100)}% parecido)`,
        };
      }

      await services.conversations.setPendingAction(userEmail, conversationId, { kind: "create_ticket", draft });
      const dueAt = computeDueAt(priority, at);
      recorder.ui.push({ type: "draft", draft, dueAt: dueAt.toISOString(), priorityReason: reason, ruleId });
      if (priority === "critical") recorder.rules.add("critical-handoff-after-confirm");

      return {
        value: {
          status: "draft_ready",
          priority: PRIORITY_LABEL[priority],
          priorityReason: reason,
          dueAt: formatDateTime(dueAt),
          instruction: "O rascunho já aparece na tela. Peça confirmação em uma frase, sem repetir os campos.",
        },
        summary: `rascunho ${input.type}, prioridade ${PRIORITY_LABEL[priority]}`,
      };
    });
  }

  async function proposeTicketUpdate(input: z.infer<typeof updateInput>): Promise<ToolResult> {
    return guarded("proposeTicketUpdate", "preparou a atualização", async () => {
      const ticket = await services.tickets.getForUser(userEmail, input.ticketId);
      recorder.rules.add("owner-scoped-query");
      if (!ticket) {
        return { value: { status: "not_found" }, summary: "chamado não encontrado entre os seus" };
      }
      if (ticket.status === "closed") {
        return { value: { status: "closed" }, summary: `${ticket.id} está encerrado` };
      }
      if (ticket.status === "resolved") {
        recorder.rules.add("reopen-window-7d");
        if (!ticket.reopenable) {
          return {
            value: {
              status: "cannot_reopen",
              instruction: "Resolvido há mais de 7 dias: não pode ser reaberto. Proponha um chamado novo com proposeTicket.",
            },
            summary: `${ticket.id} resolvido há mais de 7 dias, não reabrível`,
          };
        }
      }

      const reopen = ticket.status === "resolved";
      await services.conversations.setPendingAction(userEmail, conversationId, {
        kind: "update_ticket",
        ticketId: ticket.id,
        note: input.note,
        reopen,
      });
      recorder.ui.push({ type: "update_draft", ticketId: ticket.id, note: input.note, reopen });
      return {
        value: {
          status: "draft_ready",
          reopen,
          instruction: "O rascunho já aparece na tela. Peça confirmação em uma frase.",
        },
        summary: `${reopen ? "reabertura" : "atualização"} de ${ticket.id} aguardando confirmação`,
      };
    });
  }

  return { searchKnowledgeBase, listMyTickets, getTicket, askUser, proposeTicket, proposeTicketUpdate };
}

export type TurnActions = ReturnType<typeof createTurnActions>;