import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

const setup = () => {
  let t = 1_000_000;
  const limiter = createRateLimiter({ maxFailures: 3, windowMs: 60_000, now: () => t });
  return { limiter, advance: (ms: number) => void (t += ms) };
};

describe("rate limiter", () => {
  it("bloqueia ao atingir o máximo de falhas e informa quando tentar de novo", () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 3; i++) {
      expect(limiter.check("k").allowed).toBe(true);
      limiter.recordFailure("k");
      advance(1_000);
    }
    const blocked = limiter.check("k");
    expect(blocked.allowed).toBe(false);
    expect(!blocked.allowed && blocked.retryAfterSeconds).toBe(57); // 60s da 1ª falha − 3s decorridos
  });

  it("libera quando as falhas saem da janela", () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 3; i++) limiter.recordFailure("k");
    expect(limiter.check("k").allowed).toBe(false);
    advance(60_001);
    expect(limiter.check("k").allowed).toBe(true);
  });

  it("login bem-sucedido zera o contador", () => {
    const { limiter } = setup();
    limiter.recordFailure("k");
    limiter.recordFailure("k");
    limiter.reset("k");
    limiter.recordFailure("k");
    expect(limiter.check("k").allowed).toBe(true);
  });

  it("chaves são independentes", () => {
    const { limiter } = setup();
    for (let i = 0; i < 3; i++) limiter.recordFailure("a");
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(true);
  });
});