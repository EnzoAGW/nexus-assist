import { describe, expect, it } from "vitest";
import { encodeSse, sseResponse, type SseEvent } from "./sse";

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