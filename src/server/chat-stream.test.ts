import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ANA, NOW, createAgentEnv, fakeLlm, type AgentEnv } from "@/agent/testing";
import type { SseEvent } from "@/lib/sse";
import { chatEvents } from "./chat-stream";

let env: AgentEnv;

async function collect(llm: ReturnType<typeof fakeLlm>["llm"], text: string, maxMessages = 30): Promise<SseEvent[]> {
  const out: SseEvent[] = [];
  for await (const e of chatEvents(
    { llm, services: env.services(), now: () => NOW, maxMessages },
    { userEmail: ANA, conversationId: env.conversationId, text },
  )) {
    out.push(e);
  }
  return out;
}

beforeEach(async () => {
  env = await createAgentEnv();
});

afterEach(async () => {
  await env.ctx.cleanup();
});

describe("chatEvents", () => {
  it("turno normal: ordem dos eventos e contador da sessão", async () => {
    const events = await collect(fakeLlm().llm, "Qual o horário do service desk?");
    expect(events.map((e) => e.event)).toEqual(["user_message", "text", "agent_message", "done"]);
    expect(events[3]?.data).toMatchObject({ session: { used: 1, limit: 30 }, state: "with_agent", hasPendingAction: false });
  });

  it("a mensagem enviada ao cliente não expõe o id da conversa", async () => {
    const events = await collect(fakeLlm().llm, "oi");
    expect(Object.keys(events[2]!.data as object)).not.toContain("conversationId");
  });

  it("transferência: o done informa o novo estado", async () => {
    const { llm } = fakeLlm({ classification: { intent: "handoff_request", confidence: 0.95 } });
    const events = await collect(llm, "Quero falar com um analista");
    expect(events.at(-1)?.data).toMatchObject({ state: "awaiting_analyst" });
  });

  it("limite da sessão: blocked com mensagem e done", async () => {
    await env.ctx.cleanup();
    env = await createAgentEnv(1);
    const { llm } = fakeLlm();
    await collect(llm, "primeira", 1);
    const events = await collect(llm, "segunda", 1);
    expect(events.map((e) => e.event)).toEqual(["blocked", "done"]);
    expect(events[0]?.data).toMatchObject({ used: 1, limit: 1 });
  });
});