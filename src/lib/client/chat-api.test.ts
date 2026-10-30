import { describe, expect, it } from "vitest";
import type { ChatAction } from "./chat-state";
import { createFrameBatcher, decide, sendMessage } from "./chat-api";

const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");
const streamOf = (text: string, size = 9) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder();
      for (let i = 0; i < text.length; i += size) c.enqueue(enc.encode(text.slice(i, i + size)));
      c.close();
    },
  });
const fakeFetch = (res: Response | Error) => (async () => { if (res instanceof Error) throw res; return res; }) as unknown as typeof fetch;
const collect = () => {
  const actions: ChatAction[] = [];
  return { actions, dispatch: (a: ChatAction) => void actions.push(a) };
};
const now = () => new Date("2026-10-28T15:00:00Z");
const run = (res: Response | Error) => {
  const c = collect();
  return sendMessage("oi", { dispatch: c.dispatch, fetchImpl: fakeFetch(res), schedule: (cb) => cb(), now, newId: () => "1" }).then((outcome) => ({ outcome, actions: c.actions }));
};

const user = { id: "u1", role: "user", content: "oi" };
const agent = { id: "a1", role: "agent", content: "Ola mundo" };

describe("sendMessage", () => {
  it("turno completo: eventos na ordem e o texto chega inteiro", async () => {
    const body = sse([
      ["user_message", user],
      ["text", { delta: "Ola " }],
      ["text", { delta: "mundo" }],
      ["agent_message", agent],
      ["done", { state: "with_agent", session: { used: 1, limit: 30 }, hasPendingAction: false }],
    ]);
    const { outcome, actions } = await run(new Response(streamOf(body), { status: 200 }));

    expect(outcome).toBe("ok");
    expect(actions[0]).toMatchObject({ type: "send_started", tempId: "tmp-1" });
    expect(actions.map((a) => a.type).filter((t) => t !== "text")).toEqual(["send_started", "user_message", "agent_message", "done"]);
    expect(actions.flatMap((a) => (a.type === "text" ? [a.delta] : [])).join("")).toBe("Ola mundo");
  });

  it("evento de erro do servidor vira falha com a mensagem", async () => {
    const body = sse([["user_message", user], ["error", { message: "Limite do modelo" }]]);
    const { outcome, actions } = await run(new Response(streamOf(body)));
    expect(outcome).toBe("failed");
    expect(actions.at(-1)).toEqual({ type: "send_failed", message: "Limite do modelo" });
  });

  it("limite da sessão chega como 'blocked'", async () => {
    const body = sse([["blocked", { used: 30, limit: 30, message: "Limite atingido" }], ["done", { state: "with_agent", session: { used: 30, limit: 30 }, hasPendingAction: false }]]);
    const { actions } = await run(new Response(streamOf(body)));
    expect(actions.find((a) => a.type === "blocked")).toMatchObject({ used: 30, limit: 30 });
  });

  it("HTTP 401, erro de API e rede fora têm mensagens diferentes", async () => {
    expect((await run(new Response("{}", { status: 401 }))).actions.at(-1)).toMatchObject({ message: expect.stringContaining("sessão expirou") });
    expect((await run(new Response(JSON.stringify({ error: { message: "Dados inválidos." } }), { status: 400 }))).actions.at(-1)).toMatchObject({ message: "Dados inválidos." });
    expect((await run(new TypeError("fetch failed"))).actions.at(-1)).toMatchObject({ message: expect.stringContaining("conectar") });
  });
});

describe("decide", () => {
  it("sucesso entrega as duas mensagens", async () => {
    const c = collect();
    const payload = { userMessage: user, agentMessage: agent, state: "with_agent", hasPendingAction: false };
    await decide("confirm", { dispatch: c.dispatch, fetchImpl: fakeFetch(new Response(JSON.stringify(payload))) });
    expect(c.actions.map((a) => a.type)).toEqual(["button_started", "button_done"]);
  });

  it("falha libera os botões com um aviso", async () => {
    const c = collect();
    await decide("cancel", { dispatch: c.dispatch, fetchImpl: fakeFetch(new TypeError("x")) });
    expect(c.actions.at(-1)).toMatchObject({ type: "button_failed" });
  });
});

describe("createFrameBatcher", () => {
  it("vários pedaços no mesmo frame viram uma única atualização", () => {
    const flushed: string[] = [];
    let pending: (() => void) | null = null;
    const batcher = createFrameBatcher((t) => flushed.push(t), (cb) => void (pending = cb));
    batcher.push("a");
    batcher.push("b");
    batcher.push("c");
    expect(flushed).toEqual([]);
    pending!();
    expect(flushed).toEqual(["abc"]);
  });

  it("flush imediato entrega o que sobrou", () => {
    const flushed: string[] = [];
    const batcher = createFrameBatcher((t) => flushed.push(t), () => {});
    batcher.push("x");
    batcher.flush();
    expect(flushed).toEqual(["x"]);
  });
});