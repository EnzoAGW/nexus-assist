import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, insertUser, type TestDb } from "@/db/test-utils";
import { agentMayReply } from "@/lib/domain/conversation-state";
import type { PendingAction } from "@/lib/domain/schemas";
import { createConversationService } from "./conversations";

const ANA = "ana.souza@nexo.com.br";
const CARLA = "carla.mendes@nexo.com.br";
const RAFAEL = "rafael.lima@nexo.com.br";
const MARINA = "marina.costa@nexo.com.br";

let ctx: TestDb;
const service = (max = 30) => createConversationService(ctx.db, { maxMessagesPerSession: max });

const handoff = { reason: "Pedido do funcionário", summary: "Ana pergunta pelo INC-20311." };

const pending: PendingAction = {
  kind: "create_ticket",
  draft: {
    title: "VPN não conecta no notebook",
    description: "A VPN mostra erro 809 ao conectar, mesmo depois de reiniciar.",
    type: "INC",
    category: "Rede e VPN",
    priority: "high",
    impact: "single",
  },
};

beforeEach(async () => {
  ctx = await createTestDb();
  await insertUser(ctx.db, { email: ANA, name: "Ana Souza" });
  await insertUser(ctx.db, { email: CARLA, name: "Carla Mendes" });
  await insertUser(ctx.db, { email: RAFAEL, name: "Rafael Lima", role: "analyst", level: "N2" });
  await insertUser(ctx.db, { email: MARINA, name: "Marina Costa", role: "analyst", level: "N1" });
});

afterEach(async () => {
  await ctx.cleanup();
});

describe("ciclo de vida", () => {
  it("reaproveita a conversa aberta e abre outra só depois de encerrada", async () => {
    const svc = service();
    const a = await svc.getOrCreateForUser(ANA);
    expect((await svc.getOrCreateForUser(ANA)).id).toBe(a.id);

    await svc.requestHandoff(ANA, a.id, handoff);
    await svc.claim(RAFAEL, a.id);
    await svc.close(RAFAEL, a.id);

    expect((await svc.getOrCreateForUser(ANA)).id).not.toBe(a.id);
  });

  it("mantém as mensagens na ordem", async () => {
    const svc = service();
    const c = await svc.getOrCreateForUser(ANA);
    await svc.addMessage(c.id, { role: "user", content: "um" });
    await svc.addMessage(c.id, { role: "agent", content: "dois" });
    await svc.addMessage(c.id, { role: "user", content: "três" });
    expect((await svc.listMessages(c.id)).map((m) => m.content)).toEqual(["um", "dois", "três"]);
  });
});

describe("limite por sessão", () => {
  it("bloqueia depois do limite e libera em uma nova sessão", async () => {
    const svc = service(3);
    const c = await svc.getOrCreateForUser(ANA);
    for (let i = 1; i <= 3; i++) expect(await svc.registerUserMessage(ANA, c.id)).toMatchObject({ allowed: true, used: i });
    expect(await svc.registerUserMessage(ANA, c.id)).toMatchObject({ allowed: false });

    await svc.startSession(ANA, c.id);
    expect(await svc.registerUserMessage(ANA, c.id)).toMatchObject({ allowed: true, used: 1 });
  });
});

describe("privacidade", () => {
  it("outro funcionário não acessa nem consome a conversa", async () => {
    const svc = service();
    const c = await svc.getOrCreateForUser(ANA);
    expect(await svc.getForUser(CARLA, c.id)).toBeNull();
    expect(await svc.registerUserMessage(CARLA, c.id)).toMatchObject({ allowed: false });
    await expect(svc.setPendingAction(CARLA, c.id, pending)).rejects.toMatchObject({ code: "not_found" });
    await expect(svc.getForAnalyst(CARLA, c.id)).rejects.toMatchObject({ code: "analyst_required" });
  });
});

describe("transferência para analista", () => {
  it("fluxo completo: transferir, assumir, responder, devolver", async () => {
    const svc = service();
    const c = await svc.getOrCreateForUser(ANA);

    const waiting = await svc.requestHandoff(ANA, c.id, handoff);
    expect(waiting.state).toBe("awaiting_analyst");
    expect(agentMayReply(waiting.state)).toBe(false);

    const claimed = await svc.claim(RAFAEL, c.id);
    expect(claimed.state).toBe("with_analyst");
    expect(claimed.assignedAnalystEmail).toBe(RAFAEL);

    const reply = await svc.postAnalystMessage(RAFAEL, c.id, "Oi, Ana! Vou verificar.");
    expect(reply.role).toBe("analyst");

    const back = await svc.returnToAgent(RAFAEL, c.id);
    expect(back.state).toBe("with_agent");
    expect(back.assignedAnalystEmail).toBeNull();
    expect(agentMayReply(back.state)).toBe(true);

    const roles = (await svc.listMessages(c.id)).map((m) => m.role);
    expect(roles).toEqual(["system", "system", "analyst", "system"]);
  });

  it("transferir duas vezes é idempotente", async () => {
    const svc = service();
    const c = await svc.getOrCreateForUser(ANA);
    await svc.requestHandoff(ANA, c.id, handoff);
    await svc.requestHandoff(ANA, c.id, handoff);
    expect(await svc.listMessages(c.id)).toHaveLength(1);
  });

  it("só um analista consegue assumir", async () => {
    const svc = service();
    const c = await svc.getOrCreateForUser(ANA);
    await svc.requestHandoff(ANA, c.id, handoff);
    await svc.claim(RAFAEL, c.id);
    await expect(svc.claim(MARINA, c.id)).rejects.toMatchObject({ code: "invalid_transition" });
  });

  it("outro analista não responde, devolve nem encerra", async () => {
    const svc = service();
    const c = await svc.getOrCreateForUser(ANA);
    await svc.requestHandoff(ANA, c.id, handoff);
    await svc.claim(RAFAEL, c.id);
    await expect(svc.postAnalystMessage(MARINA, c.id, "oi")).rejects.toMatchObject({ code: "not_assigned" });
    await expect(svc.returnToAgent(MARINA, c.id)).rejects.toMatchObject({ code: "not_assigned" });
    await expect(svc.close(MARINA, c.id)).rejects.toMatchObject({ code: "not_assigned" });
  });

  it("analista não escreve antes de assumir", async () => {
    const svc = service();
    const c = await svc.getOrCreateForUser(ANA);
    await svc.requestHandoff(ANA, c.id, handoff);
    await expect(svc.postAnalystMessage(RAFAEL, c.id, "oi")).rejects.toMatchObject({ code: "not_assigned" });
  });

  it("funcionário não assume conversa", async () => {
    const svc = service();
    const c = await svc.getOrCreateForUser(ANA);
    await svc.requestHandoff(ANA, c.id, handoff);
    await expect(svc.claim(CARLA, c.id)).rejects.toMatchObject({ code: "analyst_required" });
  });

  it("a transferência descarta o rascunho pendente", async () => {
    const svc = service();
    const c = await svc.getOrCreateForUser(ANA);
    await svc.setPendingAction(ANA, c.id, pending);
    const updated = await svc.requestHandoff(ANA, c.id, handoff);
    expect(updated.pendingAction).toBeNull();
  });
});

describe("rascunho pendente", () => {
  it("só uma chamada consegue retirar (duplo clique em Confirmar)", async () => {
    const svc = service();
    const c = await svc.getOrCreateForUser(ANA);
    await svc.setPendingAction(ANA, c.id, pending);

    const [first, second] = await Promise.all([svc.takePendingAction(ANA, c.id), svc.takePendingAction(ANA, c.id)]);
    const winners = [first, second].filter(Boolean);
    expect(winners).toHaveLength(1);
    expect(winners[0]).toEqual(pending);
    expect(await svc.takePendingAction(ANA, c.id)).toBeNull();
  });

  it("não retira o rascunho de outra pessoa", async () => {
    const svc = service();
    const c = await svc.getOrCreateForUser(ANA);
    await svc.setPendingAction(ANA, c.id, pending);
    expect(await svc.takePendingAction(CARLA, c.id)).toBeNull();
  });
});