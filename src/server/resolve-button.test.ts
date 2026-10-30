import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ANA, createAgentEnv, type AgentEnv } from "@/agent/testing/helpers";
import type { PendingAction, TicketDraft } from "@/lib/domain/model/schemas";
import { resolveButton } from "./resolve-button";

let env: AgentEnv;

const DRAFT: TicketDraft = {
  title: "Teclado com teclas falhando",
  description: "Algumas teclas do teclado pararam de responder durante o uso.",
  type: "INC",
  category: "Hardware",
  priority: "medium",
  impact: "single",
};
const pending: PendingAction = { kind: "create_ticket", draft: DRAFT };

const setPending = () => env.services().conversations.setPendingAction(ANA, env.conversationId, pending);
const press = (decision: "confirm" | "cancel", failureRate = 0) =>
  resolveButton(env.services(failureRate), ANA, env.conversationId, decision);
const conversation = () => env.services().conversations.getForUser(ANA, env.conversationId);

beforeEach(async () => {
  env = await createAgentEnv();
});

afterEach(async () => {
  await env.ctx.cleanup();
});

describe("resolveButton", () => {
  it("Confirmar: cria o chamado, grava as duas mensagens e o trace diz que não houve modelo", async () => {
    await setPending();
    const { userMessage, agentMessage } = await press("confirm");

    expect(userMessage.content).toBe("Confirmar");
    expect(agentMessage.content).toContain("INC-20312");
    expect(agentMessage.trace?.rulesApplied).toContain("explicit-confirmation");
    expect(agentMessage.trace?.model).toContain("sem modelo");
    expect(agentMessage.trace?.usage.llmCalls).toBe(0);
    expect(agentMessage.ui).toMatchObject({ elements: [{ type: "ticket_card", ticketId: "INC-20312" }] });
  });

  it("duplo clique: a segunda confirmação não cria nada", async () => {
    await setPending();
    await press("confirm");
    expect((await press("confirm")).agentMessage.content).toContain("Não há nenhum rascunho");
    expect(await env.services().tickets.listForUser(ANA)).toHaveLength(4); // 3 do seed + 1
  });

  it("Cancelar: descarta o rascunho e não cria chamado", async () => {
    await setPending();
    const { agentMessage } = await press("cancel");
    expect(agentMessage.content).toContain("cancelei");
    expect((await conversation())?.pendingAction).toBeNull();
    expect(await env.services().tickets.listForUser(ANA)).toHaveLength(3);
  });

  it("sistema de chamados fora: mensagem amigável e o rascunho continua salvo", async () => {
    await setPending();
    const { agentMessage } = await press("confirm", 1);
    expect(agentMessage.content).toContain("instável");
    expect(agentMessage.trace?.rulesApplied).toContain("legacy-unavailable");
    expect((await conversation())?.pendingAction).not.toBeNull();
  });
});