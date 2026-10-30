import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, insertUser, type TestDb } from "@/db/test-utils";
import { HANDOFF } from "@/lib/domain/rules/handoff";
import { createAnalystConsoleService } from "./analyst-console";
import { createConversationService } from "./conversations";

const ANA = "ana.souza@nexo.com.br";
const CARLA = "carla.mendes@nexo.com.br";
const DIEGO = "diego.ramos@nexo.com.br";
const RAFAEL = "rafael.lima@nexo.com.br";
const MARINA = "marina.costa@nexo.com.br";

let ctx: TestDb;
let clock = new Date("2026-10-28T10:00:00Z");
const tick = () => (clock = new Date(clock.getTime() + 60_000));

const conversations = () => createConversationService(ctx.db, { maxMessagesPerSession: 30, now: () => clock });
const console_ = () => createAnalystConsoleService(ctx.db);

/** Ana (na fila há mais tempo), Carla (na fila depois) e Diego (com o agent). */
async function scenario() {
  const svc = conversations();
  const ana = await svc.getOrCreateForUser(ANA);
  const carla = await svc.getOrCreateForUser(CARLA);
  const diego = await svc.getOrCreateForUser(DIEGO);

  tick();
  await svc.addMessage(diego.id, { role: "user", content: "Como troco a senha?" });
  tick();
  await svc.requestHandoff(ANA, ana.id, { reason: HANDOFF.requested, summary: "Ana quer um analista." });
  tick();
  await svc.requestHandoff(CARLA, carla.id, { reason: "O agent não teve segurança para decidir (confiança 0.30)", summary: "Carla." });
  return { ana, carla, diego };
}

beforeEach(async () => {
  ctx = await createTestDb();
  await insertUser(ctx.db, { email: ANA, name: "Ana Souza" });
  await insertUser(ctx.db, { email: CARLA, name: "Carla Mendes" });
  await insertUser(ctx.db, { email: DIEGO, name: "Diego Ramos" });
  await insertUser(ctx.db, { email: RAFAEL, name: "Rafael Lima", role: "analyst", level: "N2" });
  await insertUser(ctx.db, { email: MARINA, name: "Marina Costa", role: "analyst", level: "N1" });
});

afterEach(async () => {
  await ctx.cleanup();
});

describe("acesso", () => {
  it("funcionário não lista, conta nem lê conversa", async () => {
    const { ana } = await scenario();
    await expect(console_().list(ANA)).rejects.toMatchObject({ code: "analyst_required" });
    await expect(console_().counts(ANA)).rejects.toMatchObject({ code: "analyst_required" });
    await expect(console_().detail(CARLA, ana.id)).rejects.toMatchObject({ code: "analyst_required" });
  });

  it("conversa inexistente: not_found", async () => {
    await expect(console_().detail(RAFAEL, "nao-existe")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("lista", () => {
  it("quem espera vem primeiro, a mais antiga antes; o agent por último", async () => {
    await scenario();
    const items = await console_().list(RAFAEL);
    expect(items.map((i) => i.employee.name)).toEqual(["Ana Souza", "Carla Mendes", "Diego Ramos"]);
  });

  it("marca o motivo da transferência, inclusive 'agent sem segurança'", async () => {
    await scenario();
    const items = await console_().list(RAFAEL, { filter: "waiting" });
    expect(items.map((i) => i.handoffKind)).toEqual(["requested", "uncertain"]);
  });

  it("filtros por estado, e 'mine' só mostra o que EU assumi", async () => {
    const { ana, carla } = await scenario();
    const svc = conversations();
    await svc.claim(RAFAEL, ana.id);
    await svc.claim(MARINA, carla.id);

    const names = async (analyst: string, filter: "waiting" | "mine" | "agent" | "closed") =>
      (await console_().list(analyst, { filter })).map((i) => i.employee.name);

    expect(await names(RAFAEL, "waiting")).toEqual([]);
    expect(await names(RAFAEL, "mine")).toEqual(["Ana Souza"]);
    expect(await names(MARINA, "mine")).toEqual(["Carla Mendes"]);
    expect(await names(RAFAEL, "agent")).toEqual(["Diego Ramos"]);

    await svc.close(RAFAEL, ana.id);
    expect(await names(RAFAEL, "closed")).toEqual(["Ana Souza"]);
    expect((await console_().list(RAFAEL)).map((i) => i.employee.name)).not.toContain("Ana Souza"); // "Todas" não inclui encerradas
  });

  it("busca por nome ou e-mail, e curingas do usuário não viram padrão", async () => {
    await scenario();
    expect((await console_().list(RAFAEL, { query: "ana" })).map((i) => i.employee.name)).toEqual(["Ana Souza"]);
    expect((await console_().list(RAFAEL, { query: "carla.mendes@" })).map((i) => i.employee.name)).toEqual(["Carla Mendes"]);
    expect(await console_().list(RAFAEL, { query: "%" })).toHaveLength(3); // vira espaço = sem filtro, não "tudo que casa %"
  });

  it("prévia é a última mensagem, e conta as do funcionário sem resposta", async () => {
    const { diego } = await scenario();
    const svc = conversations();
    await svc.addMessage(diego.id, { role: "agent", content: "Acesse o portal." });
    await svc.addMessage(diego.id, { role: "user", content: "Não achei o portal" });
    await svc.addMessage(diego.id, { role: "user", content: "Alguém aí?" });

    const item = (await console_().list(RAFAEL, { filter: "agent" }))[0];
    expect(item?.preview).toBe("Alguém aí?");
    expect(item?.waitingMessages).toBe(2);
  });
});

describe("contagens e detalhe", () => {
  it("contagens das abas", async () => {
    const { ana } = await scenario();
    await conversations().claim(RAFAEL, ana.id);
    expect(await console_().counts(RAFAEL)).toEqual({ all: 3, waiting: 1, mine: 1, agent: 1, closed: 0 });
    expect((await console_().counts(MARINA)).mine).toBe(0);
  });

  it("detalhe traz o funcionário, o analista responsável e as mensagens em ordem", async () => {
    const { ana } = await scenario();
    const svc = conversations();
    await svc.claim(RAFAEL, ana.id);
    await svc.postAnalystMessage(RAFAEL, ana.id, "Olá, Ana!");

    const d = await console_().detail(MARINA, ana.id); // outro analista pode ler
    expect(d.employee).toEqual({ name: "Ana Souza", email: ANA });
    expect(d.assignedAnalystName).toBe("Rafael Lima");
    expect(d.messages.map((m) => m.role)).toEqual(["system", "system", "analyst"]);
  });
});