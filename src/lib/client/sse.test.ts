import { describe, expect, it } from "vitest";
import { encodeSse, sseResponse, type SseEvent } from "./sse";
import { createSseParser, readSse } from "./sse";

const onError = (): SseEvent => ({ event: "error", data: { message: "falhou" } });

describe("sse", () => {
  it("formata o evento e escapa quebras de linha no JSON", () => {
    expect(encodeSse({ event: "text", data: { delta: "a\nb" } })).toBe('event: text\ndata: {"delta":"a\\nb"}\n\n');
  });

  it("transmite os eventos em ordem", async () => {
    async function* source() {
      yield { event: "a", data: 1 };
      yield { event: "b", data: 2 };
    }
    const body = await sseResponse(source(), onError).text();
    expect(body).toBe('event: a\ndata: 1\n\nevent: b\ndata: 2\n\n');
  });

  it("erro na fonte vira um evento 'error' e o stream fecha", async () => {
    async function* source(): AsyncGenerator<SseEvent> {
      yield { event: "a", data: 1 };
      throw new Error("boom");
    }
    const body = await sseResponse(source(), onError).text();
    expect(body).toContain("event: error");
  });

  it("se o cliente cancelar, a fonte ainda termina (o turno é gravado)", async () => {
    let finished = false;
    async function* source() {
      yield { event: "a", data: 1 };
      await new Promise((r) => setTimeout(r, 20));
      yield { event: "b", data: 2 };
      finished = true;
    }
    const reader = sseResponse(source(), onError).body!.getReader();
    await reader.read();
    await reader.cancel();
    await new Promise((r) => setTimeout(r, 100));
    expect(finished).toBe(true);
  });
});

describe("createSseParser", () => {
  it("junta pedaços quebrados no meio do evento", () => {
    const p = createSseParser();
    expect(p.push('event: text\nda')).toEqual([]);
    expect(p.push('ta: {"delta":"o')).toEqual([]);
    expect(p.push('i"}\n\n')).toEqual([{ event: "text", data: { delta: "oi" } }]);
  });

  it("vários eventos no mesmo pedaço", () => {
    const p = createSseParser();
    expect(p.push('event: a\ndata: 1\n\nevent: b\ndata: 2\n\n').map((m) => m.event)).toEqual(["a", "b"]);
  });

  it("ignora JSON inválido sem derrubar o stream", () => {
    const p = createSseParser();
    expect(p.push("event: a\ndata: {quebrado\n\nevent: b\ndata: 2\n\n")).toEqual([{ event: "b", data: 2 }]);
  });
});

describe("readSse", () => {
  it("lê um ReadableStream inteiro", async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('event: a\ndata: 1\n\nev'));
        c.enqueue(enc.encode('ent: b\ndata: 2\n\n'));
        c.close();
      },
    });
    const events: string[] = [];
    for await (const m of readSse(body)) events.push(m.event);
    expect(events).toEqual(["a", "b"]);
  });
});