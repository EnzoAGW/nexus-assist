import { describe, expect, it } from "vitest";
import { TicketSystemUnavailableError } from "./errors";
import { callLegacySystem, type ResilienceOptions } from "./legacy";

const sequence = (values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
};

const options = (over: Partial<ResilienceOptions> = {}): ResilienceOptions => ({
  failureRate: 0.5,
  maxAttempts: 3,
  baseDelayMs: 100,
  random: () => 0.9,
  sleep: async () => {},
  ...over,
});

describe("callLegacySystem", () => {
  it("sem falha, executa uma vez", async () => {
    let calls = 0;
    const result = await callLegacySystem("op", async () => ++calls, options());
    expect(result).toBe(1);
  });

  it("repete com backoff exponencial até conseguir", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const result = await callLegacySystem(
      "op",
      async () => {
        calls++;
        return "ok";
      },
      options({ random: sequence([0.1, 0.1, 0.9]), sleep: async (ms) => void sleeps.push(ms) }),
    );
    expect(result).toBe("ok");
    expect(sleeps).toEqual([100, 200]);
    expect(calls).toBe(1); // a operação só roda quando a tentativa não falha
  });

  it("desiste depois de maxAttempts", async () => {
    const sleeps: number[] = [];
    const promise = callLegacySystem("listar", async () => 1, options({
      failureRate: 1,
      random: () => 0.5,
      sleep: async (ms) => void sleeps.push(ms),
    }));
    await expect(promise).rejects.toBeInstanceOf(TicketSystemUnavailableError);
    await expect(promise).rejects.toMatchObject({ attempts: 3 });
    expect(sleeps).toEqual([100, 200]); // sem espera depois da última tentativa
  });

  it("não repete erros que não são transitórios", async () => {
    let calls = 0;
    const promise = callLegacySystem("op", async () => {
      calls++;
      throw new Error("boom");
    }, options());
    await expect(promise).rejects.toThrow("boom");
    expect(calls).toBe(1);
  });

  it("repete SQLITE_BUSY", async () => {
    let calls = 0;
    const result = await callLegacySystem("op", async () => {
      if (++calls === 1) throw Object.assign(new Error("busy"), { code: "SQLITE_BUSY" });
      return "ok";
    }, options({ failureRate: 0 }));
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });
});