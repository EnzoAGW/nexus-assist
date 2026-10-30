import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TicketDraft } from "@/lib/domain/model/schemas";
import { LlmUnavailableError } from "../llm/port";
import { runTurn, type TurnEvent } from "./run-turn";
import { ANA, NOW, RAFAEL, createAgentEnv, fakeLlm, type AgentEnv } from "../testing/helpers";

let env: AgentEnv;

const DRAFT: TicketDraft = {
  title: "Teclado com teclas falhando",
  description: "Algumas teclas do teclado pararam de responder durante o uso.",
  type: "INC",
  category: "Hardware",
  priority: "medium",
  impact: "single",
};

async function run(llm: ReturnType<typeof fakeLlm>["llm"], text: string, failureRate = 0): Promise<TurnEvent[]> {
  const events: TurnEvent[] = [];
  for await (const e of runTurn({ llm, services: env.services(failureRate), now: () => NOW }, { userEmail: ANA, conversationId: env.conversationId, text })) {
    events.push(e);
  }
  return events;
}

const agentMessage = (events: TurnEvent[]) =>
  events.find((e): e is Extract<TurnEvent, { type: "agent_message" }> => e.type === "agent_message")?.message;

const conversation = () => env.services().conversations.getForUser(ANA, env.conversationId);
const myTickets = () => env.services().tickets.listForUser(ANA);

beforeEach(async () => {
  env = await createAgentEnv();
});

afterEach(async () => {
  await env.ctx.cleanup();
});

describe("pausa e limite", () => {
  it("com um analista, o agent não responde e nem chama o modelo", async () => {
    const svc = env.services().conversations;
    await svc.requestHandoff(ANA, env.conversationId, { reason: "x", summary: "y" });
    await svc.claim(RAFAEL, env.conversationId);

    const { llm, calls } = fakeLlm();
    const events = await run(llm, "Alguém aí?");

    expect(events.map((e) => e.type)).toEqual(["user_message", "paused"]);
    expect(calls).toEqual({ classify: 0, respond: 0 });
  });

  it("depois do limite por sessão, bloqueia sem gravar nem chamar o modelo", async () => {
    await env.ctx.cleanup();
    env = await createAgentEnv(1);
    const { llm, calls } = fakeLlm();

    await run(llm, "primeira");
    const events = await run(llm, "segunda");

    expect(events).toEqual([{ type: "blocked", reason: "session_limit", used: 1, limit: 1 }]);
    expect(calls.classify).toBe(1);
    const msgs = await env.services().conversations.listMessages(env.conversationId);
    expect(msgs.filter((m) => m.role === "user")).toHaveLength(1);
  });
});

describe("roteamento por código", () => {
  it("fora de escopo: redireciona sem chamar o modelo principal", async () => {
    const { llm, calls } = fakeLlm({ classification: { intent: "out_of_scope" } });
    const message = agentMessage(await run(llm, "Quando sai meu 13º?"));
    expect(message?.content).toContain("TI");
    expect(message?.trace?.rulesApplied).toContain("out-of-scope-redirect");
    expect(calls.respond).toBe(0);
  });

  it("baixa confiança: transfere para um analista com resumo", async () => {
    const { llm, calls } = fakeLlm({ classification: { intent: "ticket_create", confidence: 0.3 } });
    const message = agentMessage(await run(llm, "aquilo lá de novo"));

    expect((await conversation())?.state).toBe("awaiting_analyst");
    expect((await conversation())?.handoffSummary).toContain("aquilo lá de novo");
    expect(message?.trace?.handoffReason).toContain("segurança");
    expect(message?.trace?.rulesApplied).toContain("low-confidence");
    expect(calls.respond).toBe(0);
  });

  it("pedido de analista: transfere", async () => {
    const { llm } = fakeLlm({ classification: { intent: "handoff_request", confidence: 0.95 } });
    const message = agentMessage(await run(llm, "Quero falar com um analista"));
    expect((await conversation())?.state).toBe("awaiting_analyst");
    expect(message?.trace?.rulesApplied).toContain("user-requested-handoff");
  });
});

describe("agent com ferramentas", () => {
  it("abertura de chamado: rascunho com prioridade do código, trace completo e nada criado", async () => {
    const { llm } = fakeLlm({
      classification: { intent: "ticket_create" },
      respond: async ({ actions }) => {
        await actions.proposeTicket({ ...DRAFT, blocksWork: true, deadlineToday: false });
        return "Preparei o rascunho. Posso confirmar?";
      },
    });
    const message = agentMessage(await run(llm, "Meu teclado parou de funcionar"));
    expect(message?.trace?.actions.map((a) => a.tool)).toEqual([
      "classifyIntent",
      "searchKnowledgeBase",
      "listMyTickets",
      "proposeTicket",
    ]);
    expect(message?.trace?.rulesApplied).toEqual(expect.arrayContaining(["person-blocked", "duplicate-check"]));
    expect(message?.trace?.usage).toEqual({ inputTokens: 300, outputTokens: 60, llmCalls: 2 });
    expect(message?.trace?.model).toBe("fake-model");
    expect(message?.ui).toMatchObject({ elements: [{ type: "draft" }] });
    expect((await conversation())?.pendingAction).toMatchObject({ kind: "create_ticket" });
    expect(await myTickets()).toHaveLength(3); // o LLM não criou nada
  });

  it("resposta vazia com rascunho pronto usa um texto de apoio", async () => {
    const { llm } = fakeLlm({
      classification: { intent: "ticket_create" },
      respond: async ({ actions }) => {
        await actions.proposeTicket({ ...DRAFT, blocksWork: false, deadlineToday: false });
        return "";
      },
    });
    expect(agentMessage(await run(llm, "teclado"))?.content).toContain("rascunho");
  });
});

describe("confirmação digitada", () => {
  it("com confiança alta, executa o rascunho uma única vez", async () => {
    await env.services().conversations.setPendingAction(ANA, env.conversationId, { kind: "create_ticket", draft: DRAFT });
    const { llm, calls } = fakeLlm({ classification: { intent: "confirmation", confidence: 0.95 } });

    const message = agentMessage(await run(llm, "sim, pode criar"));

    expect((await myTickets()).map((t) => t.id)).toContain("INC-20312");
    expect((await conversation())?.pendingAction).toBeNull();
    expect(message?.ui).toMatchObject({ elements: [{ type: "ticket_card", ticketId: "INC-20312" }] });
    expect(message?.trace?.rulesApplied).toContain("explicit-confirmation-typed");
    expect(calls.respond).toBe(0);
  });

  it("com confiança média, pede para usar o botão e não cria nada", async () => {
    await env.services().conversations.setPendingAction(ANA, env.conversationId, { kind: "create_ticket", draft: DRAFT });
    const { llm } = fakeLlm({ classification: { intent: "confirmation", confidence: 0.7 } });

    expect(agentMessage(await run(llm, "acho que sim"))?.content).toContain("botões");
    expect(await myTickets()).toHaveLength(3);
    expect((await conversation())?.pendingAction).not.toBeNull();
  });
});
describe("consultas feitas pelo código antes do modelo", () => {
  it("abrir chamado não mostra a lista de chamados na tela (consulta só interna)", async () => {
    const { llm } = fakeLlm({ classification: { intent: "ticket_create" }, respond: async () => "Quantas pessoas são afetadas?" });
    const message = agentMessage(await run(llm, "Meu notebook está lento depois da atualização"));
    const types = (message?.ui as { elements?: { type: string }[] } | null)?.elements?.map((e) => e.type) ?? [];
    expect(types).not.toContain("ticket_list");
    expect(message?.trace?.rulesApplied).not.toContain("sla-overdue");
  });

  it("pedir os chamados sem número mostra a lista para escolher", async () => {
    const { llm } = fakeLlm({ classification: { intent: "ticket_lookup" } });
    const message = agentMessage(await run(llm, "Como estão meus chamados?"));
    expect(message?.ui).toMatchObject({ elements: [{ type: "ticket_list", ticketIds: expect.arrayContaining(["INC-20311"]) }] });
  });

  it("mensagem com número: busca o chamado e, se vencido, o código oferece o analista", async () => {
    const { llm } = fakeLlm({ classification: { intent: "ticket_lookup" } });
    const message = agentMessage(await run(llm, "INC-20311 · Notebook lento após atualização"));

    expect(message?.trace?.actions.map((a) => a.tool)).toEqual(["classifyIntent", "getTicket"]);
    expect(message?.trace?.rulesApplied).toContain("sla-overdue");
    expect(message?.ui).toMatchObject({
      elements: [{ type: "ticket_card" }, { type: "quick_replies", options: ["Falar com um analista", "Adicionar informações", "Não, obrigado"] }],
    });
  });

  it("legado fora: o modelo recebe 'unavailable' e o turno continua", async () => {
    let context = "";
    const { llm } = fakeLlm({
      classification: { intent: "ticket_lookup" },
      respond: async (input) => {
        context = input.context;
        return "O sistema está instável.";
      },
    });
    const message = agentMessage(await run(llm, "Como estão meus chamados?", 1));

    expect(context).toContain("unavailable");
    expect(message?.trace?.rulesApplied).toContain("legacy-unavailable");
  });
});
describe("cota do modelo esgotada", () => {
  it("ao classificar: mensagem amigável, oferta de analista e conversa intacta", async () => {
    const { llm } = fakeLlm({ classifyError: new LlmUnavailableError() });
    const message = agentMessage(await run(llm, "oi"));

    expect(message?.content).toContain("muitas solicitações");
    expect(message?.ui).toMatchObject({ elements: [{ type: "quick_replies", options: ["Falar com um analista"] }] });
    expect(message?.trace?.rulesApplied).toContain("llm-unavailable");
    expect((await conversation())?.state).toBe("with_agent");
  });

  it("ao responder: mesma recuperação", async () => {
    const { llm } = fakeLlm({
      respond: async () => {
        throw new LlmUnavailableError();
      },
    });
    expect(agentMessage(await run(llm, "como faço para trocar a senha?"))?.trace?.rulesApplied).toContain("llm-unavailable");
  });
});
