import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ticketUpdates } from "@/db/schema";
import { createTestDb, insertTicket, insertUser, type TestDb } from "@/db/test-utils";
import type { TicketDraft } from "@/lib/domain/schemas";
import { TicketSystemUnavailableError } from "./errors";
import type { ResilienceOptions } from "./legacy";
import { createTicketService } from "./tickets";

const NOW = new Date("2026-10-28T15:00:00-03:00"); // quarta-feira
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

const ANA = "ana.souza@nexo.com.br";
const CARLA = "carla.mendes@nexo.com.br";
const RAFAEL = "rafael.lima@nexo.com.br";

const resilience = (over: Partial<ResilienceOptions> = {}): ResilienceOptions => ({
  failureRate: 0,
  maxAttempts: 3,
  baseDelayMs: 0,
  random: () => 0.5,
  sleep: async () => { },
  ...over,
});

const draft: TicketDraft = {
  title: "Teclado com teclas falhando",
  description: "Algumas teclas do teclado pararam de responder durante o uso.",
  type: "INC",
  category: "Hardware",
  priority: "medium",
  impact: "single",
};

let ctx: TestDb;
const service = (over: Partial<ResilienceOptions> = {}) =>
  createTicketService(ctx.db, { now: () => NOW, resilience: resilience(over) });

beforeEach(async () => {
  ctx = await createTestDb();
  await insertUser(ctx.db, { email: ANA, name: "Ana Souza" });
  await insertUser(ctx.db, { email: CARLA, name: "Carla Mendes" });
  await insertUser(ctx.db, { email: RAFAEL, name: "Rafael Lima", role: "analyst", level: "N2" });

  await insertTicket(ctx.db, {
    id: "INC-20311", requesterEmail: ANA, status: "awaiting_analyst",
    createdAt: daysAgo(8), lastUpdatedAt: daysAgo(6),
  });
  await insertTicket(ctx.db, { id: "INC-20305", requesterEmail: CARLA });
  await insertTicket(ctx.db, {
    id: "INC-20150", requesterEmail: ANA, title: "Senha do SAP bloqueada", category: "Acesso",
    status: "resolved", lastUpdatedAt: daysAgo(4), resolvedAt: daysAgo(4),
  });
  await insertTicket(ctx.db, {
    id: "INC-20044", requesterEmail: ANA, title: "Outlook não sincroniza no celular", category: "E-mail",
    status: "resolved", lastUpdatedAt: daysAgo(9), resolvedAt: daysAgo(9),
  });
});

afterEach(async () => {
  await ctx.cleanup();
});

describe("privacidade", () => {
  it("lista apenas os chamados do próprio usuário", async () => {
    const list = await service().listForUser(ANA);
    expect(list.map((t) => t.id).sort()).toEqual(["INC-20044", "INC-20150", "INC-20311"]);
  });

  it("chamado de outra pessoa é indistinguível de chamado inexistente", async () => {
    const svc = service();
    expect(await svc.getForUser(ANA, "INC-20305")).toBeNull();
    expect(await svc.getForUser(ANA, "INC-99999")).toBeNull();
  });

  it("não atualiza nem escala chamado alheio", async () => {
    const svc = service();
    expect(await svc.addUpdate(ANA, "INC-20305", "Também estou com esse problema")).toEqual({ status: "not_found" });
    expect(await svc.escalate(ANA, "INC-20305", "teste")).toEqual({ status: "not_found" });
    expect(await ctx.db.select().from(ticketUpdates)).toHaveLength(0);
  });

  it("e-mail não diferencia maiúsculas", async () => {
    expect(await service().getForUser("ANA.Souza@Nexo.com.br", "inc-20311")).not.toBeNull();
  });

  it("só analista lista chamados de outro funcionário", async () => {
    const svc = service();
    expect(await svc.listAsAnalyst(RAFAEL, CARLA)).toHaveLength(1);
    await expect(svc.listAsAnalyst(ANA, CARLA)).rejects.toMatchObject({ code: "analyst_required" });
  });
});

describe("prazo e reabertura", () => {
  it("marca vencido e informa o prazo", async () => {
    const ticket = await service().getForUser(ANA, "INC-20311");
    expect(ticket?.overdue).toBe(true);
    expect(ticket?.dueAt.getTime()).toBeLessThan(NOW.getTime());
  });

  it("reabrível apenas dentro de 7 dias", async () => {
    const svc = service();
    expect((await svc.getForUser(ANA, "INC-20150"))?.reopenable).toBe(true);
    expect((await svc.getForUser(ANA, "INC-20044"))?.reopenable).toBe(false);
  });
});

describe("criação", () => {
  it("cria com o próximo número da sequência", async () => {
    const result = await service().createTicket(ANA, draft);
    expect(result.status).toBe("created");
    if (result.status !== "created") return;
    expect(result.ticket.id).toBe("INC-20312");
    expect(result.ticket.status).toBe("open");
    expect(await service().getForUser(ANA, "INC-20312")).not.toBeNull();
  });

  it("começa a sequência de REQ quando ainda não existe nenhuma", async () => {
    const result = await service().createTicket(ANA, { ...draft, type: "REQ", priority: "low" });
    expect(result.status === "created" && result.ticket.id).toBe("REQ-10001");
  });

  it("não duplica: devolve o chamado ativo parecido", async () => {
    const svc = service();
    const result = await svc.createTicket(ANA, {
      ...draft,
      title: "Notebook muito lento depois da atualização do Windows",
    });
    expect(result.status).toBe("duplicate");
    if (result.status !== "duplicate") return;
    expect(result.candidates[0]?.ticket.id).toBe("INC-20311");
    expect(result.candidates[0]?.action).toBe("update");
    expect(await svc.listForUser(ANA)).toHaveLength(3); // nada foi criado
  });

  it("sugere reabrir o resolvido há 4 dias", async () => {
    const result = await service().createTicket(ANA, {
      ...draft,
      title: "Senha do SAP bloqueada novamente",
      category: "Acesso",
    });
    expect(result.status === "duplicate" && result.candidates[0]?.action).toBe("reopen");
  });

  it("resolvido há 9 dias não bloqueia um chamado novo", async () => {
    const result = await service().createTicket(ANA, {
      ...draft,
      title: "Outlook não sincroniza no celular de novo",
      category: "E-mail",
    });
    expect(result.status).toBe("created");
  });

  it("ignoreDuplicates permite criar mesmo assim", async () => {
    const result = await service().createTicket(
      ANA,
      { ...draft, title: "Notebook muito lento depois da atualização do Windows" },
      { ignoreDuplicates: true },
    );
    expect(result.status).toBe("created");
  });

  it("rejeita rascunho inválido", async () => {
    await expect(service().createTicket(ANA, { ...draft, title: "oi" })).rejects.toThrow();
  });
});

describe("atualização, reabertura e escalonamento", () => {
  it("complemento não reinicia o prazo", async () => {
    const result = await service().addUpdate(ANA, "INC-20311", "Continua lento e agora trava no Teams.");
    expect(result.status).toBe("updated");
    if (result.status !== "updated") return;
    expect(result.ticket.lastUpdatedAt).toEqual(daysAgo(6));
    expect(result.ticket.overdue).toBe(true);
    expect(await ctx.db.select().from(ticketUpdates)).toHaveLength(1);
  });

  it("reabre o resolvido há 4 dias e reinicia o prazo", async () => {
    const result = await service().addUpdate(ANA, "INC-20150", "A senha bloqueou de novo hoje.");
    expect(result.status).toBe("reopened");
    if (result.status !== "reopened") return;
    expect(result.ticket.status).toBe("open");
    expect(result.ticket.resolvedAt).toBeNull();
    expect(result.ticket.overdue).toBe(false);
  });

  it("não reabre o resolvido há 9 dias", async () => {
    expect(await service().addUpdate(ANA, "INC-20044", "Voltou a falhar.")).toEqual({ status: "cannot_reopen" });
  });

  it("não atualiza chamado encerrado", async () => {
    await insertTicket(ctx.db, { id: "REQ-10001", requesterEmail: ANA, status: "closed" });
    expect(await service().addUpdate(ANA, "REQ-10001", "Complemento")).toEqual({ status: "closed" });
  });

  it("escala chamado ativo e recusa um resolvido", async () => {
    const svc = service();
    await insertTicket(ctx.db, { id: "INC-20400", requesterEmail: ANA, status: "open" });
    const escalated = await svc.escalate(ANA, "INC-20400", "Pedido do funcionário");
    expect(escalated.status === "escalated" && escalated.ticket.status).toBe("awaiting_analyst");
    expect(await svc.escalate(ANA, "INC-20150", "teste")).toEqual({ status: "not_active" });
  });
});

describe("sistema legado instável", () => {
  it("falha de forma controlada depois das tentativas", async () => {
    const svc = service({ failureRate: 1 });
    await expect(svc.listForUser(ANA)).rejects.toBeInstanceOf(TicketSystemUnavailableError);
  });

  it("não cria nada quando o legado está fora", async () => {
    await expect(service({ failureRate: 1 }).createTicket(ANA, draft)).rejects.toBeInstanceOf(
      TicketSystemUnavailableError,
    );
    expect(await service().listForUser(ANA)).toHaveLength(3);
  });

  it("recupera quando a primeira tentativa falha", async () => {
    let call = 0;
    const svc = service({ failureRate: 0.5, random: () => (call++ === 0 ? 0.1 : 0.9) });
    expect(await svc.listForUser(ANA)).toHaveLength(3);
  });
});